---
summary: "Browser action surface guide mapping Windie browser actions to sidecar handlers, snapshots, refs, extraction, tabs, and file operations."
read_when:
  - When adding, removing, or changing browser actions or shared browser action schemas.
  - When debugging browser action validation, ref resolution, snapshots, extraction, tab switching, or browser file operations.
title: "Browser Action Surface"
---

# Browser Action Surface

The browser action surface starts at the backend model-facing `browser` tool and executes in the sidecar through `WindieBrowserRuntime`.

## Schema And Dispatch

| Concern | Files |
| --- | --- |
| Backend tool catalog | `backend/src/tools/tool_catalog.py` |
| Backend remote browser tool | `backend/src/tools/remote_tools/browser.py` |
| Shared browser contract | `frontend/src/main/python/windie_shared/browser_contract.py` |
| Sidecar schema re-export | `frontend/src/main/python/tools/browser/schemas.py` |
| Sidecar entrypoint | `frontend/src/main/python/tools/browser/browser_tool.py` |
| Runtime dispatch | `frontend/src/main/python/tools/browser/windie_runtime.py` |
| Imperative page actions | `frontend/src/main/python/tools/browser/action_executor.py` |

The sidecar validates `BrowserControlArgs` before dispatch. Unsupported actions raise `ACTION_UNSUPPORTED`; connected-page actions raise `BROWSER_NOT_CONNECTED` when no browser session exists.

## Current Runtime Actions

`WindieBrowserRuntime` handles:

- `connect`, `status`, `profiles`
- `navigate`, `snapshot`, `extract`
- `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`
- `get_tabs`, `switch`, `close_tab`, `close`
- `evaluate`, `done`, `search`, `go_back`
- `search_page`, `find_elements`, `find_text`
- `dropdown_options`, `select_dropdown`, `upload_file`
- `write_file`, `replace_file`, `read_file`, `read_long_content`

When adding an action, update all contract surfaces and tests together.

## Snapshot And Ref Semantics

`snapshot` returns browser-use-style text from `BrowserController.get_page_snapshot(format_type="ai")`.

Important limits:

- default page limit: `4000` chars,
- max snapshot window: `120000` chars,
- page-changing actions should restart snapshot pagination at `offset=0`.

Refs can be:

- numeric Browser Use indexes,
- role refs like `e12`,
- target ids for tab/session actions.

Role refs are resolved by `role_snapshot.py`, `ref_registry.py`, `observation_store.py`, and controller/action executor helpers. Do not parse role refs ad hoc inside a new action.

## Extraction And Long Content

Extraction helpers live in `frontend/src/main/python/tools/browser/content_extraction.py`.

Use extraction when the user asks for semantic page content. Use snapshot when the model needs interactive element refs or page structure for action planning.

Long-content reads should preserve offsets and limits so the agent can continue reading without changing page state.

## Tab Control

Tab state comes from the controller context and renderer polling.

Relevant renderer files:

- `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js`
- `frontend/src/renderer/infrastructure/hooks/useBrowserSessionControl.js`
- `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`

Renderer controls call the generic `EXECUTE_TOOL` IPC path with `toolName: "browser"` and `skipAutoCapture: true`. They should not bypass the tool bridge.

## Tests

```bash
./scripts/test-backend tests/backend/test_browser_remote_tool.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_schemas.py tests/sidecar/tools/test_browser_tool.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/tools/test_browser_action_executor.py tests/sidecar/tools/test_browser_ref_registry.py tests/sidecar/tools/test_browser_observation_store.py -q
cd frontend && npm run test:ci -- ChatBrowserSessionControl.test.jsx
```

