# Dev Tool Selection (Backend)

Purpose: development/testing only. Control which tool schemas get injected into the LLM prompt, without editing core tool registry code.

## Config File

Edit `backend/dev/tool_selection.toml`.

Behavior:
- `enabled = false`: no filtering (default).
- `mode = "denylist"`: all tools available except those in `tools`.
- `mode = "allowlist"`: only tools in `tools` are available.

Tool names are the schema names (example: `mouse_control`, `browser_control`, `read_file`). Canonical list: `backend/src/tools/remote.py` (`REMOTE_TOOLS`).

## Mouse Coordinate Method Selection

`mouse_control` supports method-level filtering:

```toml
[tool_options.mouse_control]
enabled_coordinate_methods = ["manual", "ocr", "prediction"]
```

Allowed values:
- `manual`
- `ocr`
- `prediction`

Effects:
- Disabled methods are removed from the injected `mouse_control` schema.
- Disabled methods are rejected by parser validation if the LLM still calls them.
- If `ocr` is disabled, OCR service does not initialize at backend startup and is disabled for proactive/lazy OCR.
- If `prediction` is disabled, vision service does not initialize at backend startup.

## Optional Override

You can point to a different file:
- `WINDIEOS_DEV_TOOL_SELECTION_PATH=/abs/path/to/tool_selection.toml`
