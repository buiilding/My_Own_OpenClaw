# Dev Tool Selection (Backend)

Purpose: development/testing only. Control which tool schemas get injected into the LLM prompt, without editing core tool registry code.

## Config File

Edit `backend/dev/tool_selection.toml`.

Behavior:
- `enabled = false`: no filtering (default).
- `mode = "denylist"`: all tools available except those in `tools`.
- `mode = "allowlist"`: only tools in `tools` are available.

Tool names are the schema names (example: `mouse_control`, `browser`, `read_file`). Canonical list: `backend/src/tools/remote_tools/registry.py` (`REMOTE_TOOLS`).

Policy implementation lives in `backend/src/tools/tool_policy.py` and is used by:
- prompt schema injection filtering
- parser whitelist/method validation
- available-tool capability listing
- container startup gating for OCR/Vision

Deep runtime reference:
- [`docs/backend/tools/policy/tool_policy_and_dev_tool_selection_runtime_reference.md`](../backend/tools/policy/tool_policy_and_dev_tool_selection_runtime_reference.md)

## Ready Profiles

Prebuilt profiles:
- `backend/dev/tool_selection.full.toml`
- `backend/dev/tool_selection.coding.toml`
- `backend/dev/tool_selection.computer.toml`
- `backend/dev/tool_selection.browser.toml`

Run backend with a profile:

```bash
WINDIEOS_DEV_TOOL_SELECTION_PATH=backend/dev/tool_selection.coding.toml \
  ./scripts/python-in-env backend python -m backend.src.main
```

Or use the helper script:

```bash
backend/dev/run_backend_with_tools.sh coding
backend/dev/run_backend_with_tools.sh computer
backend/dev/run_backend_with_tools.sh browser
backend/dev/run_backend_with_tools.sh full
```

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
