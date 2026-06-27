---
summary: "Browser action surface guide mapping browser actions to local-runtime handlers, snapshots, refs, extraction, tabs, and file operations."
read_when:
  - When adding, removing, or changing browser actions or shared browser action schemas.
  - When debugging browser action validation, ref resolution, snapshots, extraction, tab switching, or browser file operations.
title: "Browser Action Surface"
---

# Browser Action Surface

The browser action surface starts at the backend model-facing `browser` tool and executes through SDK/main local-runtime dispatch into `BrowserUseEngineRuntime`, a local-runtime Python adapter over the maintained Browser Use CLI daemon.

## Schema And Dispatch

| Concern | Files |
| --- | --- |
| Backend tool catalog | private backend implementation |
| Backend remote browser tool | private backend implementation |
| Shared browser contract | `frontend/src/main/python/windie_shared/browser_contract.py` |
| Local-runtime Python entrypoint | `frontend/src/main/python/tools/browser/browser_tool.py` |
| Runtime dispatch | `frontend/src/main/python/tools/browser/browser_use_engine.py` |
| Browser engine | installed `browser-use[cli]` package |

The local-runtime Python adapter validates `BrowserControlArgs` before dispatch. Unsupported actions raise `ACTION_UNSUPPORTED`; Browser Use daemon failures are normalized as Browser Use engine errors.

## Current Runtime Actions

`BrowserUseEngineRuntime` maps these canonical actions to Browser Use CLI commands or explicit adapter-owned helpers:

- `connect`, `status`, `profiles`
- `navigate`, `snapshot`, `extract`
- `click`, `input`, `send_keys`, `scroll`, `screenshot`, `wait`
- `get_tabs`, `switch`, `close_tab`, `close`
- `evaluate`, `done`, `search`, `go_back`
- `search_page`, `find_elements`, `find_text`
- `select_dropdown`, `upload_file`, `hover`, `save_as_pdf`
- `get_text`, `get_value`, `get_attributes`, `get_bbox`
- `write_file`, `replace_file`, `read_file`, `read_long_content`

When adding an action, update all contract surfaces and tests together.

## Snapshot And Index Semantics

`snapshot` returns Browser Use state text in the canonical `output` field.

Important limits:

- default page limit: `4000` chars,
- max snapshot window: `120000` chars,
- page-changing actions should restart snapshot pagination at `offset=0`.

Element actions use numeric Browser Use indexes from the latest `snapshot`
`output`. Tab actions use numeric tab indexes from `get_tabs`.

`ref` aliases and role refs such as `e12` are Windie-owned legacy identities and
are rejected by the schema before Browser Use dispatch.

`find_elements` returns CSS-query `ordinal` values only. These ordinals are
not Browser Use interaction indexes and must not be fed into `click`, `input`,
`hover`, `upload_file`, `select_dropdown`, or `get_*` actions.

## Extraction And Long Content

Extraction helpers live in `frontend/src/main/python/tools/browser/content_extraction.py`.

Use extraction when the user asks for semantic page content. Use snapshot when the model needs interactive element refs or page structure for action planning.

Long-content reads should preserve offsets and limits so the agent can continue reading without changing page state.

## Tab Control

Tab state comes from Browser Use state/status results and renderer polling.

Relevant renderer files:

- `frontend/src/renderer/infrastructure/runtime/browserSessionStore.js`
- `frontend/src/renderer/app/runtime/desktopBrowserSessionRuntimeClient.js`
- `frontend/src/renderer/features/chat/components/ChatBrowserSessionControl.jsx`

Renderer controls call the named `RUN_BROWSER_ACTION` IPC channel. Electron
main maps that scoped host-capability request to the local browser tool; renderer
code should not invoke the generic `execute-tool` bridge directly.

## Tests

```bash
private backend tests private backend tests -q
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/tools/test_browser_schemas.py tests/sidecar/tools/test_browser_tool.py tests/sidecar/tools/test_browser_use_engine.py -q
<windie> test frontend -- ChatBrowserSessionControl.test.jsx
```
