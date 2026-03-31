"""Client-local sidecar tool exposure contract."""

EXPOSED_TO_BACKEND_TOOL_NAMES = frozenset(
    {
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "switch_tab",
        "wait",
        "get_open_windows",
        "get_system_stats",
        "open_app",
        "run_shell_command",
        "process",
        "read_file",
        "replace",
        "browser",
    }
)
