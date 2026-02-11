# Dev Tool Selection (Backend)

Purpose: development/testing only. Control which tool schemas get injected into the LLM prompt, without editing core tool registry code.

## Config File

Edit `backend/dev/tool_selection.toml`.

Behavior:
- `enabled = false`: no filtering (default).
- `mode = "denylist"`: all tools available except those in `tools`.
- `mode = "allowlist"`: only tools in `tools` are available.

Tool names are the schema names (example: `mouse_control`, `browser_control`, `read_file`). Canonical list: `backend/src/tools/remote.py` (`REMOTE_TOOLS`).

## Optional Override

You can point to a different file:
- `WINDIEOS_DEV_TOOL_SELECTION_PATH=/abs/path/to/tool_selection.toml`

