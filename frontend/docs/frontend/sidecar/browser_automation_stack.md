---
summary: "End-to-end local-runtime browser tool implementation: IPC/JSON-RPC path, shared browser contract validation, Browser Use engine dispatch, and browser file/snapshot boundaries."
read_when:
  - When changing local-runtime browser tool behavior, action routing, or CDP launch policy.
  - When debugging browser connect/snapshot/action failures across Agent SDK runtime, Electron main, and local-runtime Python.
title: "Local-Runtime Browser Automation Stack"
---

# Local-Runtime Browser Automation Stack

The Electron agent host currently routes the canonical `browser` tool through
local-runtime browser execution backed by a local-runtime Python Browser Use engine adapter. The old
first-party `WindieBrowserRuntime` and vendored `browser_use.browser` session
runtime were removed from source; do not add new browser behavior to those
retired paths.

## End-to-End Call Path

Request path for browser actions:

1. Agent SDK runtime routes a local browser tool call through the SDK local-runtime client.
2. Electron main `local_runtime_bridge.cjs` sends JSON-RPC `execute_tool`.
3. Local-runtime Python `local_backend.py` routes to `ToolRegistry.execute_tool("browser", args)`.
4. `tools/browser/browser_tool.py:execute_browser(...)` validates `BrowserControlArgs`.
5. `BrowserUseEngineRuntime.execute(...)` maps the canonical action to a Browser Use CLI command or adapter-owned helper.
6. Browser Use performs browser/session mechanics while the adapter normalizes action result data.

Main-process timeout behavior:

- browser tool timeout: `120000ms`
- other tools default timeout: `60000ms`

## Local-Runtime Tool Registration Surface

`frontend/src/main/python/tools/registry.py`:

- browser tool key: `"browser"` -> `execute_browser`
- browser is included in `EXPOSED_TO_BACKEND_TOOLS`
- startup warns when exposed tools expected by backend schemas are missing locally

## Action Routing Layers

### Layer 1: browser tool entrypoint

`browser_tool.py`:

- validates `args` object and `action`
- instantiates `BrowserUseEngineRuntime`
- converts engine success/failure into canonical `ToolResult`

### Layer 2: Browser Use engine adapter

`browser_use_engine.py`:

- maps validated canonical actions to Browser Use CLI commands or adapter-owned helpers
- rejects unsupported actions with `ACTION_UNSUPPORTED`
- ensures a dedicated Browser Use session is connected when required
- requires successful Browser Use CLI responses to carry object-shaped `data`
- routes deterministic extraction through `content_extraction.py`
- routes browser-local file actions through `file_store.py`

Important runtime constants:

- `DEFAULT_SNAPSHOT_PAGE_LIMIT`
- `MAX_SNAPSHOT_WINDOW_CHARS`
- `RUNTIME_SOURCE = "browser_use.cli"`

## Shared Contract and Runtime Parity

Canonical schema and runtime action coverage are shared through:

- `frontend/src/main/python/windie_shared/browser_contract_models.py`
- `frontend/src/main/python/windie_shared/browser_contract_catalog.py`
- `frontend/src/main/python/windie_shared/browser_contract_schema.py`
- `frontend/src/main/python/windie_shared/browser_contract.py`
- private backend implementation

When adding/removing actions, update the shared contract, backend schema wrappers, local-runtime validation entrypoint, local-runtime Python Browser Use handler bindings, and parity tests together.

Use [Browser Change Workflow](../../browser/browser_change_workflow.md) for the full owner map and validation matrix.

## CDP and Chrome Launch Policy

Core launcher modules:

- `tools/browser/chrome_launcher.py`
- `tools/browser/chrome_detection.py`

Policy:

- The app uses a dedicated browser profile dir (separate from user default profile)
- default CDP endpoint: `http://127.0.0.1:9333`
- CDP port can be overridden with `AGENT_BROWSER_CDP_PORT`
  (`WINDIE_BROWSER_CDP_PORT` in WindieOS launches)
- browser executable auto-detected cross-platform (Chrome/Brave/Edge/Chromium)

Connect behavior:

- adapter `connect` always targets the dedicated browser scope
- runtime can auto-launch Chrome with CDP when endpoint unavailable

## Schema Validation and Safety

`windie_shared/browser_contract.py` provides pydantic models per action.

Safety constraints include:

- strict action literals
- argument bounds (`max_chars`, scroll amount ranges, etc.)
- `connect.cdp_url` localhost-only validation for security
- required selector/ref/coordinate checks for click/input families

## Browser Files and Extraction

`tools/browser/content_extraction.py` owns page content extraction, scoped HTML capture, markdown conversion, and long-content bounds.

`tools/browser/file_store.py` owns browser-local file paths. Relative browser file paths resolve under the browser file root, defaulting to:

```text
~/.desktop-agent/browser
```

Set `AGENT_BROWSER_FILES_DIR` or the WindieOS alias
`WINDIE_BROWSER_FILES_DIR=~/.windieos/browser` when a diagnostic run needs to
reuse files written under the legacy root.

Absolute browser file paths and `..` escapes are invalid. Browser file actions must stay under the browser file root instead of becoming general filesystem operations.

Do not route browser-owned file actions through general filesystem tools unless the product behavior is intentionally changing.

## Failure Surfaces and Diagnostics

Frequent failure points:

- local-runtime bridge timeout in Electron (`execute-tool` call timeout)
- Browser Use CLI/package import or command failures
- CDP endpoint unavailable and Chrome auto-launch failure
- schema validation errors for malformed action payloads
- connection-required action invoked before `connect`

Where errors are normalized:

- `BrowserUseEngineRuntime` raises `BrowserActionError` with stable error codes
- browser tool converts failures into `ToolResult` failures with `error_code`
- local-runtime bridge maps JSON-RPC failures to `{ success: false, error }`

## Related Pages

- [Local-Runtime Browser Docs Hub](browser/README.md)
- [Browser Change Workflow](../../browser/browser_change_workflow.md)
- [Local-Runtime Browser Chrome Docs Hub](browser/chrome/README.md)
