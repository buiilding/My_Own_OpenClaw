---
summary: "End-to-end browser tool runtime in sidecar: IPC/JSON-RPC path, shared browser contract validation, WindieBrowserRuntime dispatch, BrowserController + CDP orchestration, and browser file/snapshot boundaries."
read_when:
  - When changing sidecar browser tool behavior, action routing, or CDP launch policy.
  - When debugging browser connect/snapshot/action failures across SDK main runtime, Electron main, and Python sidecar.
title: "Browser Automation Stack"
---

# Browser Automation Stack

WindieOS currently uses a first-party Windie browser runtime. Older Browser Use adapter/provider layers are not the current action dispatch path for the canonical `browser` tool.

## End-to-End Call Path

Request path for browser actions:

1. SDK main runtime routes a local browser tool call through the SDK local-runtime client.
2. Electron main `local_backend_bridge.cjs` sends JSON-RPC `execute_tool`.
3. Python sidecar `local_backend.py` routes to `ToolRegistry.execute_tool("browser", args)`.
4. `tools/browser/browser_tool.py:execute_browser(...)` validates `BrowserControlArgs`.
5. `WindieBrowserRuntime.execute(...)` maps the canonical action to a runtime handler.
6. Runtime handlers talk to `BrowserController`, content extraction helpers, or browser file helpers and return normalized action result data.

Main-process timeout behavior:

- browser tool timeout: `120000ms`
- other tools default timeout: `60000ms`

## Sidecar Tool Registration Surface

`frontend/src/main/python/tools/registry.py`:

- browser tool key: `"browser"` -> `execute_browser`
- browser is included in `EXPOSED_TO_BACKEND_TOOLS`
- startup warns when exposed tools expected by backend schemas are missing locally

## Action Routing Layers

### Layer 1: browser tool entrypoint

`browser_tool.py`:

- validates `args` object and `action`
- resolves `get_browser_controller` lazily at execution time to avoid import-time Playwright dependency
- instantiates `WindieBrowserRuntime`
- converts runtime success/failure into canonical `ToolResult`

### Layer 2: Windie runtime

`windie_runtime.py`:

- declares `_RUNTIME_HANDLER_BINDINGS`
- exposes `WindieBrowserRuntime.supported_actions()`
- rejects unsupported actions with `ACTION_UNSUPPORTED`
- enforces connection preconditions with `BROWSER_NOT_CONNECTED`
- routes page actions through `BrowserController` and `BrowserActionExecutor`
- routes extraction through `content_extraction.py`
- routes browser-local file actions through `file_store.py`

Important runtime constants:

- `BROWSER_RUNTIME_ACTIONS`
- `DEFAULT_SNAPSHOT_PAGE_LIMIT`
- `MAX_SNAPSHOT_WINDOW_CHARS`
- `RUNTIME_SOURCE = "windie.browser"`

## Shared Contract and Runtime Parity

Canonical schema and runtime action coverage are shared through:

- `frontend/src/main/python/windie_shared/browser_contract_models.py`
- `frontend/src/main/python/windie_shared/browser_contract_catalog.py`
- `frontend/src/main/python/windie_shared/browser_contract_schema.py`
- `frontend/src/main/python/windie_shared/browser_contract.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `backend/src/tools/browser/**`

When adding/removing actions, update the shared contract, backend schema wrappers, sidecar schema re-export, runtime handler bindings, and parity tests together.

Use [Browser Change Workflow](../../browser/browser_change_workflow.md) for the full owner map and validation matrix.

## BrowserController Runtime Capabilities

`tools/browser/controller.py` responsibilities:

- Playwright browser/context/page lifecycle
- tab tracking and ref registry management
- page snapshot generation (AI or aria modes)
- click/type/scroll/navigation/evaluate actions
- screenshot capture (full page/element)
- console/dialog/network/page-error observation buffers

Enhanced snapshot stack:

- `EnhancedCdpDomPipeline` merges DOM snapshot + AX tree + computed style hints
- marks interactive nodes and emits LLM-oriented textual snapshot with stable refs

## CDP and Chrome Launch Policy

Core launcher modules:

- `tools/browser/chrome_launcher.py`
- `tools/browser/chrome_detection.py`

Policy:

- WindieOS uses a dedicated browser profile dir (separate from user default profile)
- default CDP endpoint: `http://127.0.0.1:9333`
- CDP port can be overridden with `WINDIE_BROWSER_CDP_PORT`
- browser executable auto-detected cross-platform (Chrome/Brave/Edge/Chromium)

Connect behavior:

- adapter `connect` always targets WindieOS dedicated browser scope
- runtime can auto-launch Chrome with CDP when endpoint unavailable

## Schema Validation and Safety

`tools/browser/schemas.py` provides pydantic models per action.

Safety constraints include:

- strict action literals
- argument bounds (`max_chars`, scroll amount ranges, etc.)
- `connect.cdp_url` localhost-only validation for security
- required selector/ref/coordinate checks for click/input families

## Browser Files and Extraction

`tools/browser/content_extraction.py` owns page content extraction, scoped HTML capture, markdown conversion, and long-content bounds.

`tools/browser/file_store.py` owns browser-local file paths. Relative browser file paths resolve under the browser file root, defaulting to:

```text
~/.windieos/browser
```

Do not route browser-owned file actions through general filesystem tools unless the product behavior is intentionally changing.

## Failure Surfaces and Diagnostics

Frequent failure points:

- sidecar bridge timeout in Electron (`execute-tool` call timeout)
- browser runtime provider import/path errors (vendored package missing/misaligned)
- CDP endpoint unavailable and Chrome auto-launch failure
- schema validation errors for malformed action payloads
- connection-required action invoked before `connect`

Where errors are normalized:

- `WindieBrowserRuntime` raises `BrowserActionError` with stable error codes
- browser tool converts failures into `ToolResult` failures with `error_code`
- local backend bridge maps JSON-RPC failures to `{ success: false, error }`

## Related Pages

- [Sidecar Browser Docs Hub](browser/README.md)
- [Browser Change Workflow](../../browser/browser_change_workflow.md)
- [Sidecar Browser Chrome Docs Hub](browser/chrome/README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
