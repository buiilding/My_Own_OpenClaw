"""Runtime capability application helpers for agent sessions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.src.core.config import AppConfig
from backend.src.llm.prompts.prompt_images import (
    PromptImageProjector,
    policy_from_config,
)
from backend.src.tools.tool_policy import ToolPolicy
from backend.src.tools.tool_selection import ToolSelection

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession


def accepted_client_tool_names(manifest_result: Any) -> list[str]:
    if manifest_result is None or not hasattr(manifest_result, "accepted_tool_names"):
        return []
    return [
        tool_name
        for tool_name in list(manifest_result.accepted_tool_names or [])
        if isinstance(tool_name, str) and tool_name.strip()
    ]


def accepted_client_tool_schemas(manifest_result: Any) -> list[dict[str, Any]]:
    if manifest_result is None or not hasattr(manifest_result, "accepted_tool_schemas"):
        return []
    return [
        schema
        for schema in list(manifest_result.accepted_tool_schemas or [])
        if isinstance(schema, dict)
    ]


def capability_config_overrides(
    *,
    manifest_result: Any,
    agent_definition: Any = None,
    replace_available_tools: bool = True,
    base_available_tools: list[str] | None = None,
) -> dict[str, Any]:
    """Build session-config overrides for accepted runtime capabilities."""
    accepted_names = accepted_client_tool_names(manifest_result)
    if agent_definition is not None and hasattr(
        agent_definition, "to_session_config_overrides"
    ):
        overrides = dict(
            agent_definition.to_session_config_overrides(
                accepted_client_tool_names=accepted_names,
            )
        )
        tool_mode = getattr(getattr(agent_definition, "tools", None), "mode", None)
        if (
            tool_mode == "default_plus_client"
            and accepted_names
            and base_available_tools is not None
            and "agent_available_tools" not in overrides
        ):
            overrides["agent_available_tools"] = _dedupe_strings(
                [*base_available_tools, *accepted_names]
            )
        return overrides

    if replace_available_tools:
        return {"agent_available_tools": _dedupe_strings(accepted_names)}

    available_tools = list(base_available_tools or [])
    return {
        "agent_available_tools": _dedupe_strings([*available_tools, *accepted_names])
    }


def apply_client_capability_to_session(
    session: "AgentSession",
    manifest_result: Any,
    *,
    agent_definition: Any = None,
    replace_available_tools: bool = True,
) -> dict[str, int]:
    """Apply accepted client tools to prompt schemas and effective tool policy."""
    runtime = getattr(session, "runtime", None)
    previous_client_tool_names = accepted_client_tool_names(
        getattr(runtime, "client_tool_manifest", None) if runtime is not None else None
    )
    if runtime is not None:
        runtime.client_tool_manifest = manifest_result

    accepted_schemas = accepted_client_tool_schemas(manifest_result)
    accepted_names = accepted_client_tool_names(manifest_result)
    prompt_builder = getattr(session, "prompt_builder", None)
    if prompt_builder is not None:
        setattr(prompt_builder, "client_tool_schemas", list(accepted_schemas))

    overrides = capability_config_overrides(
        manifest_result=manifest_result,
        agent_definition=agent_definition,
        replace_available_tools=replace_available_tools,
        base_available_tools=getattr(session.cfg, "agent_available_tools", None),
    )
    merge_runtime_tools_into_config_overrides(
        session.cfg,
        overrides,
        accepted_tool_names=accepted_names,
        previous_tool_names=previous_client_tool_names,
    )
    _apply_capability_config_overrides(session, overrides)
    merge_runtime_tools_into_prompt_policy(
        prompt_builder,
        accepted_tool_names=accepted_names,
        previous_tool_names=previous_client_tool_names,
    )

    filtered_client_count = 0
    tool_policy = getattr(prompt_builder, "tool_policy", None)
    if isinstance(tool_policy, ToolPolicy) and accepted_schemas:
        filtered_schemas = tool_policy.filter_tool_schemas(accepted_schemas)
        if isinstance(filtered_schemas, list):
            filtered_client_count = len(filtered_schemas)

    return {
        "accepted_tool_count": len(accepted_schemas),
        "effective_available_tool_count": len(
            getattr(session.cfg, "agent_available_tools", None) or []
        ),
        "policy_allowed_client_tool_count": filtered_client_count,
        "prompt_builder_client_tool_count": len(
            getattr(prompt_builder, "client_tool_schemas", []) or []
        ),
    }


def apply_agent_definition_tool_policy_to_session(
    session: "AgentSession",
    agent_definition: Any,
    *,
    manifest_result: Any = None,
) -> dict[str, int]:
    """Apply non-manifest tool-policy fields from an agent definition."""
    overrides = capability_config_overrides(
        manifest_result=manifest_result,
        agent_definition=agent_definition,
        replace_available_tools=False,
        base_available_tools=getattr(session.cfg, "agent_available_tools", None),
    )
    _apply_capability_config_overrides(session, overrides)
    return {
        "effective_available_tool_count": len(
            getattr(session.cfg, "agent_available_tools", None) or []
        ),
    }


def _apply_capability_config_overrides(
    session: "AgentSession",
    overrides: dict[str, Any],
) -> None:
    if not overrides:
        return

    current_config = session.cfg.model_dump()
    changed = False
    for key, value in overrides.items():
        if value is None:
            continue
        if current_config.get(key) != value:
            current_config[key] = value
            changed = True
    if not changed:
        return

    new_config = AppConfig(**current_config)
    session.cfg = new_config
    prompt_builder = getattr(session, "prompt_builder", None)
    if prompt_builder is None:
        return

    if hasattr(prompt_builder, "config"):
        prompt_builder.config = new_config
    if hasattr(prompt_builder, "tool_policy"):
        prompt_builder.tool_policy = ToolPolicy.from_config(new_config)
    if hasattr(prompt_builder, "prompt_image_projector"):
        prompt_builder.prompt_image_projector = PromptImageProjector(
            policy_from_config(new_config)
        )


def merge_runtime_tools_into_config_overrides(
    config: AppConfig,
    overrides: dict[str, Any],
    *,
    accepted_tool_names: list[str],
    previous_tool_names: list[str],
) -> None:
    if not accepted_tool_names and not previous_tool_names:
        return

    get_tool_allowlist = getattr(config, "get_tool_allowlist", None)
    current_allowlist = get_tool_allowlist() if callable(get_tool_allowlist) else None
    if current_allowlist is None:
        return

    previous_tool_set = set(previous_tool_names)
    base_allowlist = [
        name
        for name in current_allowlist
        if isinstance(name, str) and name not in previous_tool_set
    ]
    overrides["tool_allowlist"] = _dedupe_strings(
        [*base_allowlist, *accepted_tool_names]
    )


def merge_runtime_tools_into_prompt_policy(
    prompt_builder: Any,
    *,
    accepted_tool_names: list[str],
    previous_tool_names: list[str],
) -> None:
    if prompt_builder is None or (not accepted_tool_names and not previous_tool_names):
        return
    tool_policy = getattr(prompt_builder, "tool_policy", None)
    if not isinstance(tool_policy, ToolPolicy):
        return
    selection = tool_policy.selection
    if selection is None or not selection.enabled or selection.mode != "allowlist":
        return

    previous_tool_set = set(previous_tool_names)
    base_tools = [
        name
        for name in selection.tools
        if isinstance(name, str) and name not in previous_tool_set
    ]
    tool_policy.selection = ToolSelection(
        enabled=selection.enabled,
        mode=selection.mode,
        tools=frozenset(_dedupe_strings([*base_tools, *accepted_tool_names])),
        mouse_enabled_coordinate_methods=selection.mouse_enabled_coordinate_methods,
    )


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = value.strip() if isinstance(value, str) else ""
        if not item or item in seen:
            continue
        seen.add(item)
        deduped.append(item)
    return deduped
