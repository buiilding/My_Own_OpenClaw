"""Session config and client OS state helpers for SessionManager."""

from __future__ import annotations

import asyncio
import inspect
import logging
from collections.abc import Iterable
from typing import TYPE_CHECKING, Any, Callable, Optional

from backend.src.agent.session.capability_application import (
    apply_agent_definition_tool_policy_to_session,
    apply_client_capability_to_session,
    capability_config_overrides,
)
from backend.src.agent.session.prompt_layers import validate_client_prompt_layers
from backend.src.core.config.models import AppConfig
from backend.src.llm.prompts.prompts import render_contextual_system_prompt
from backend.src.tools.client_manifest import validate_client_tool_manifest
from backend.src.tools.provider_health import merge_unavailable_capabilities
from backend.src.tools.tool_policy import ToolPolicy

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.session.session_registry import SessionRegistry

logger = logging.getLogger(__name__)


class SessionConfigService:
    """Own user overrides, client OS state, and effective-session config assembly."""

    def __init__(
        self,
        *,
        base_config: AppConfig,
        registry: "SessionRegistry",
        assemble_runtime_session_config: Callable[[AppConfig], AppConfig],
        render_system_prompt: Callable[..., str],
        provider_health_resolver: Optional[Callable[[AppConfig], Iterable[str]]] = None,
    ) -> None:
        self._base_config = base_config
        self._registry = registry
        self._assemble_runtime_session_config = assemble_runtime_session_config
        self._render_system_prompt = render_system_prompt
        self._provider_health_resolver = provider_health_resolver
        self.user_config_overrides: dict[str, dict[str, Any]] = {}
        self.client_operating_systems: dict[str, str] = {}
        self.client_tool_manifests: dict[str, Any] = {}
        self.agent_definitions: dict[str, Any] = {}
        self._user_config_versions: dict[str, int] = {}
        self._deferred_update_tasks: dict[str, asyncio.Task[None]] = {}

    def set_base_config(self, config: AppConfig) -> None:
        self._base_config = config

    def build_effective_config(
        self,
        user_id: str,
        *,
        base_config: Optional[AppConfig] = None,
    ) -> AppConfig:
        config_dict = (base_config or self._base_config).model_dump()
        overrides = self.user_config_overrides.get(user_id, {})
        for key, value in overrides.items():
            if value is not None:
                config_dict[key] = value
        if self._provider_health_resolver is not None:
            probe_config = AppConfig(**config_dict)
            unavailable = self._provider_health_resolver(probe_config)
            config_dict["agent_provider_unavailable_capabilities"] = (
                merge_unavailable_capabilities(
                    config_dict.get("agent_provider_unavailable_capabilities"),
                    unavailable,
                )
            )
        return self._assemble_runtime_session_config(AppConfig(**config_dict))

    def get_effective_config(self, user_id: str) -> AppConfig:
        return self.build_effective_config(user_id)

    @staticmethod
    def normalize_client_operating_system(
        operating_system: Optional[str],
    ) -> Optional[str]:
        if not isinstance(operating_system, str):
            return None
        normalized = operating_system.strip()
        return normalized or None

    def apply_client_operating_system_to_session(
        self,
        session: "AgentSession",
        operating_system: str,
    ) -> None:
        runtime = getattr(session, "runtime", None)
        agent_definition = getattr(runtime, "agent_definition", None)
        self.apply_prompt_context_to_session(
            session,
            operating_system=operating_system,
            workspace_path=getattr(runtime, "workspace_path", None),
            repo_instruction_messages=getattr(
                runtime, "repo_instruction_messages", None
            ),
            client_prompt_layers=getattr(runtime, "client_prompt_layers", None),
            system_prompt_override=(
                agent_definition.system_prompt_override()
                if hasattr(agent_definition, "system_prompt_override")
                else None
            ),
        )

    @staticmethod
    def normalize_workspace_path(
        workspace_path: Optional[str],
    ) -> Optional[str]:
        if not isinstance(workspace_path, str):
            return None
        normalized = workspace_path.strip()
        return normalized or None

    def apply_prompt_context_to_session(
        self,
        session: "AgentSession",
        *,
        operating_system: Optional[str],
        workspace_path: Optional[str],
        repo_instruction_messages: Optional[list[dict[str, str]]] = None,
        client_prompt_layers: Optional[list[dict[str, Any]]] = None,
        system_prompt_override: Optional[str] = None,
    ) -> None:
        normalized_workspace_path = self.normalize_workspace_path(workspace_path)
        rendered_prompt = (
            render_contextual_system_prompt(
                system_prompt_override,
                operating_system,
                normalized_workspace_path,
            )
            if isinstance(system_prompt_override, str)
            and system_prompt_override.strip()
            else self._call_render_system_prompt(
                operating_system=operating_system,
                workspace_path=normalized_workspace_path,
                allowed_coordinate_methods=ToolPolicy.from_config(
                    getattr(session, "cfg", self._base_config)
                ).get_allowed_mouse_coordinate_methods(),
            )
        )
        normalized_repo_instruction_messages = [
            {"role": message["role"], "content": message["content"]}
            for message in (repo_instruction_messages or [])
            if (
                isinstance(message, dict)
                and message.get("role") == "user"
                and isinstance(message.get("content"), str)
                and message["content"].strip()
            )
        ]
        normalized_client_prompt_layers = validate_client_prompt_layers(
            client_prompt_layers
        ).accepted
        runtime = getattr(session, "runtime", None)
        if runtime is not None:
            runtime.workspace_path = normalized_workspace_path
            runtime.repo_instruction_messages = normalized_repo_instruction_messages
            runtime.client_prompt_layers = normalized_client_prompt_layers
        session.prompt_builder.system_prompt = rendered_prompt
        setattr(session.prompt_builder, "workspace_path", normalized_workspace_path)
        setattr(
            session.prompt_builder,
            "repo_instruction_messages",
            list(normalized_repo_instruction_messages),
        )
        setattr(
            session.prompt_builder,
            "client_prompt_layers",
            list(normalized_client_prompt_layers),
        )
        session.history.system_prompt = rendered_prompt

    def apply_client_tool_manifest_to_session(
        self,
        session: "AgentSession",
        manifest_result: Any,
        *,
        agent_definition: Any = None,
        replace_available_tools: bool = True,
    ) -> None:
        apply_client_capability_to_session(
            session,
            manifest_result,
            agent_definition=agent_definition,
            replace_available_tools=replace_available_tools,
        )

    def set_client_tool_manifest(
        self,
        user_id: str,
        manifest_result: Any,
    ) -> None:
        self.client_tool_manifests[user_id] = manifest_result
        overrides = capability_config_overrides(
            manifest_result=manifest_result,
            replace_available_tools=True,
        )
        if overrides:
            self.user_config_overrides.setdefault(user_id, {}).update(overrides)
        for _, session in self._registry.iter_user_sessions(user_id):
            self.apply_client_tool_manifest_to_session(session, manifest_result)

    def apply_agent_definition_to_session(
        self,
        session: "AgentSession",
        agent_definition: Any,
    ) -> None:
        if agent_definition is None:
            return
        runtime = getattr(session, "runtime", None)
        if runtime is not None:
            runtime.agent_definition = agent_definition
        raw_manifest = (
            agent_definition.client_tool_manifest()
            if hasattr(agent_definition, "client_tool_manifest")
            else None
        )
        if raw_manifest is not None:
            manifest_result = validate_client_tool_manifest(raw_manifest)
            self.apply_client_tool_manifest_to_session(
                session,
                manifest_result,
                agent_definition=agent_definition,
            )
        else:
            apply_agent_definition_tool_policy_to_session(session, agent_definition)
        definition_runtime = getattr(agent_definition, "runtime", None)
        operating_system = getattr(definition_runtime, "operating_system", None)
        workspace_path = getattr(definition_runtime, "workspace_path", None)
        client_prompt_layers = (
            agent_definition.client_prompt_layers()
            if hasattr(agent_definition, "client_prompt_layers")
            else None
        )
        system_prompt_override = (
            agent_definition.system_prompt_override()
            if hasattr(agent_definition, "system_prompt_override")
            else None
        )
        if (
            operating_system is not None
            or workspace_path is not None
            or system_prompt_override is not None
            or client_prompt_layers
        ):
            self.apply_prompt_context_to_session(
                session,
                operating_system=operating_system,
                workspace_path=workspace_path,
                repo_instruction_messages=getattr(
                    runtime, "repo_instruction_messages", None
                ),
                client_prompt_layers=client_prompt_layers,
                system_prompt_override=system_prompt_override,
            )

    def set_agent_definition(
        self,
        user_id: str,
        agent_definition: Any,
    ) -> None:
        self.agent_definitions[user_id] = agent_definition
        for _, session in self._registry.iter_user_sessions(user_id):
            self.apply_agent_definition_to_session(session, agent_definition)

    def _call_render_system_prompt(
        self,
        *,
        operating_system: Optional[str],
        workspace_path: Optional[str],
        allowed_coordinate_methods: Optional[frozenset[str]] = None,
    ) -> str:
        try:
            signature = inspect.signature(self._render_system_prompt)
        except (TypeError, ValueError):
            signature = None

        if signature is None:
            return self._render_system_prompt(operating_system, workspace_path)

        positional_params = [
            parameter
            for parameter in signature.parameters.values()
            if parameter.kind
            in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
        ]
        has_varargs = any(
            parameter.kind == inspect.Parameter.VAR_POSITIONAL
            for parameter in signature.parameters.values()
        )

        if "allowed_coordinate_methods" in signature.parameters:
            return self._render_system_prompt(
                operating_system,
                workspace_path,
                allowed_coordinate_methods=allowed_coordinate_methods,
            )
        if has_varargs or len(positional_params) >= 2:
            return self._render_system_prompt(operating_system, workspace_path)
        if len(positional_params) == 1:
            return self._render_system_prompt(operating_system)
        return self._render_system_prompt()

    def set_client_operating_system(
        self,
        user_id: str,
        operating_system: Optional[str],
    ) -> None:
        normalized_operating_system = self.normalize_client_operating_system(
            operating_system
        )
        if normalized_operating_system is None:
            return
        self.client_operating_systems[user_id] = normalized_operating_system
        for _, session in self._registry.iter_user_sessions(user_id):
            self.apply_client_operating_system_to_session(
                session,
                normalized_operating_system,
            )

    async def update_session_config(
        self,
        user_id: str,
        updates: dict[str, Any],
    ) -> None:
        if not updates:
            return

        user_lock = await self._registry.get_user_lock(user_id)
        async with user_lock:
            changed_override_keys = self._merge_user_config_overrides(
                user_id,
                updates,
            )
            if changed_override_keys:
                self._user_config_versions[user_id] = (
                    self._user_config_versions.get(user_id, 0) + 1
                )
            sessions = list(self._registry.get_user_sessions(user_id).values())
            updated_config = self.build_effective_config(user_id) if sessions else None

        if not sessions or updated_config is None:
            return

        deferred_needed = False
        for session in sessions:
            if not self._session_config_differs(session, updated_config):
                continue
            applied = await self._try_update_session_config(session, updated_config)
            if not applied:
                deferred_needed = True

        if deferred_needed:
            self._schedule_deferred_session_config_update(user_id)

    def _merge_user_config_overrides(
        self,
        user_id: str,
        updates: dict[str, Any],
    ) -> bool:
        overrides = self.user_config_overrides.setdefault(user_id, {})
        changed_override_keys = False
        for key, value in updates.items():
            if value is None:
                continue
            if overrides.get(key) != value:
                overrides[key] = value
                changed_override_keys = True
        return changed_override_keys

    @staticmethod
    def _session_config_differs(session: "AgentSession", config: AppConfig) -> bool:
        return session.cfg.model_dump() != config.model_dump()

    @staticmethod
    async def _try_update_session_config(
        session: "AgentSession",
        config: AppConfig,
    ) -> bool:
        try_update_config = getattr(session, "try_update_config", None)
        if callable(try_update_config):
            return bool(await try_update_config(config))
        await session.update_config(config)
        return True

    def _schedule_deferred_session_config_update(self, user_id: str) -> None:
        existing_task = self._deferred_update_tasks.get(user_id)
        if existing_task is not None and not existing_task.done():
            return
        task = asyncio.create_task(
            self._run_deferred_session_config_update(user_id),
            name=f"session-config-update:{user_id}",
        )
        self._deferred_update_tasks[user_id] = task

    async def _run_deferred_session_config_update(self, user_id: str) -> None:
        try:
            while True:
                user_lock = await self._registry.get_user_lock(user_id)
                async with user_lock:
                    version = self._user_config_versions.get(user_id, 0)
                    sessions = list(self._registry.get_user_sessions(user_id).values())
                    updated_config = (
                        self.build_effective_config(user_id) if sessions else None
                    )

                if updated_config is not None:
                    for session in sessions:
                        if self._session_config_differs(session, updated_config):
                            await session.update_config(updated_config)

                async with user_lock:
                    if version == self._user_config_versions.get(user_id, 0):
                        return
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "Deferred session config update failed for user %s",
                user_id,
            )
        finally:
            current_task = asyncio.current_task()
            if self._deferred_update_tasks.get(user_id) is current_task:
                self._deferred_update_tasks.pop(user_id, None)

    async def update_all_sessions_config(self, config: AppConfig) -> None:
        self.set_base_config(config)
        errors: list[tuple[str, Exception]] = []
        for user_id in self._registry.iter_user_ids():
            user_lock = await self._registry.get_user_lock(user_id)
            async with user_lock:
                user_sessions = self._registry.get_user_sessions(user_id)
                if not user_sessions:
                    continue
                updated_config = self.build_effective_config(
                    user_id, base_config=config
                )
                for session in user_sessions.values():
                    try:
                        await session.update_config(updated_config)
                    except Exception as exc:
                        logger.error(
                            "Error updating config for user %s session: %s",
                            user_id,
                            exc,
                            exc_info=True,
                        )
                        errors.append((user_id, exc))
        if errors:
            logger.warning("Failed to update config for %s session(s)", len(errors))

    def clear_user_state(self, user_id: str) -> None:
        self.client_operating_systems.pop(user_id, None)
        self.user_config_overrides.pop(user_id, None)
        self.agent_definitions.pop(user_id, None)
        self.client_tool_manifests.pop(user_id, None)
        self._user_config_versions.pop(user_id, None)
        deferred_task = self._deferred_update_tasks.pop(user_id, None)
        if deferred_task is not None and not deferred_task.done():
            deferred_task.cancel()
