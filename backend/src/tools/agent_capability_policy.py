"""Agent capability policy helpers.

This module converts typed runtime config into the same structural selection
object already used by the backend tool policy. It is intentionally small: the
policy resolver should narrow model-visible tools without becoming a second
tool registry.
"""

from __future__ import annotations

from typing import Any, Optional

from backend.src.tools.tool_selection import ToolSelection

COORDINATE_METHODS: tuple[str, ...] = ("manual", "ocr", "prediction")

TOOL_PROFILES: dict[str, frozenset[str]] = {
    "chat": frozenset(
        {
            "open_app",
            "process",
            "mouse_control",
            "keyboard_control",
            "screenshot",
            "scroll_control",
            "switch_window",
            "wait",
            "run_shell_command",
            "replace",
            "read_file",
            "get_system_stats",
            "get_open_windows",
            "web_search",
        }
    ),
    "coding": frozenset(
        {
            "run_shell_command",
            "process",
            "read_file",
            "replace",
            "screenshot",
        }
    ),
    "browser": frozenset(
        {
            "browser",
            "run_shell_command",
        }
    ),
    "computer": frozenset(
        {
            "mouse_control",
            "keyboard_control",
            "screenshot",
            "scroll_control",
            "switch_window",
            "wait",
            "get_open_windows",
            "get_system_stats",
            "run_shell_command",
        }
    ),
    "full": frozenset(
        {
            "browser",
            "mouse_control",
            "keyboard_control",
            "screenshot",
            "scroll_control",
            "switch_window",
            "wait",
            "get_open_windows",
            "get_system_stats",
            "run_shell_command",
            "open_app",
            "process",
            "read_file",
            "replace",
            "web_search",
        }
    ),
}


def _string_set(values: Any) -> set[str]:
    if not isinstance(values, (list, tuple, set, frozenset)):
        return set()
    return {
        value.strip() for value in values if isinstance(value, str) and value.strip()
    }


def _normalized_profile(config: Any) -> str:
    raw_profile = getattr(config, "agent_tool_profile", "default")
    if not isinstance(raw_profile, str):
        return "default"
    profile = raw_profile.strip().lower()
    return profile or "default"


def normalize_coordinate_methods(values: Any) -> Optional[frozenset[str]]:
    """Normalize configured coordinate methods, preserving canonical order."""
    if values is None:
        return None
    requested = _string_set(values)
    return frozenset(method for method in COORDINATE_METHODS if method in requested)


def available_tools_from_config(config: Any) -> Optional[frozenset[str]]:
    """Return client/session available tool names, when supplied."""
    values = getattr(config, "agent_available_tools", None)
    if values is None:
        return None
    return frozenset(_string_set(values))


def disabled_tools_from_config(config: Any) -> set[str]:
    """Return direct tool names disabled by session/server capability policy."""
    disabled = _string_set(getattr(config, "agent_disabled_tools", None))
    disabled_capabilities = disabled_capabilities_from_config(config)
    if "browser" in disabled_capabilities:
        disabled.add("browser")
    if "web_search" in disabled_capabilities:
        disabled.add("web_search")
    return disabled


def disabled_capabilities_from_config(config: Any) -> set[str]:
    """Return user/server-disabled plus provider-unavailable capabilities."""
    disabled = _string_set(getattr(config, "agent_disabled_capabilities", None))
    disabled.update(
        _string_set(getattr(config, "agent_provider_unavailable_capabilities", None))
    )
    return disabled


def coordinate_methods_from_config(config: Any) -> Optional[frozenset[str]]:
    """Return configured coordinate methods after capability and client gates."""
    methods = normalize_coordinate_methods(
        getattr(config, "agent_coordinate_methods", None)
    )
    available_methods = normalize_coordinate_methods(
        getattr(config, "agent_available_coordinate_methods", None)
    )
    disabled_capabilities = disabled_capabilities_from_config(config)

    if methods is None and available_methods is None and not disabled_capabilities:
        return None

    effective = set(methods) if methods is not None else set(COORDINATE_METHODS)
    if available_methods is not None:
        effective.intersection_update(available_methods)
    if "ocr" in disabled_capabilities:
        effective.discard("ocr")
    if "vision" in disabled_capabilities:
        effective.discard("prediction")
    return frozenset(method for method in COORDINATE_METHODS if method in effective)


def _profile_tools(config: Any) -> Optional[frozenset[str]]:
    profile = _normalized_profile(config)
    if profile in {"default", "custom"}:
        return None
    return TOOL_PROFILES.get(profile)


def build_agent_tool_selection(config: Any) -> Optional[ToolSelection]:
    """Build a structural selection from typed session/server config."""
    profile_tools = _profile_tools(config)
    available_tools = available_tools_from_config(config)
    disabled_tools = disabled_tools_from_config(config)
    coordinate_methods = coordinate_methods_from_config(config)

    if (
        profile_tools is None
        and available_tools is None
        and not disabled_tools
        and coordinate_methods is None
    ):
        return None

    if profile_tools is not None or available_tools is not None:
        tools = set(
            profile_tools if profile_tools is not None else available_tools or ()
        )
        if available_tools is not None:
            tools.intersection_update(available_tools)
        tools.difference_update(disabled_tools)
        return ToolSelection(
            enabled=True,
            mode="allowlist",
            tools=frozenset(tools),
            mouse_enabled_coordinate_methods=coordinate_methods,
        )

    return ToolSelection(
        enabled=True,
        mode="denylist",
        tools=frozenset(disabled_tools),
        mouse_enabled_coordinate_methods=coordinate_methods,
    )
