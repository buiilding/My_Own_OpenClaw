---
summary: "End-to-end browser tool runtime in sidecar: IPC/JSON-RPC path, adapter/runtime provider layers, BrowserController + CDP orchestration, and Browser Use vendoring/security rules."
read_when:
  - When changing sidecar browser tool behavior, action routing, or CDP launch policy.
  - When debugging browser connect/snapshot/action failures across renderer, Electron main, and Python sidecar.
title: "Browser Automation Stack"
---

# Browser Automation Stack

## End-to-End Call Path

Request path for browser actions:

1. Renderer `ToolExecutionService` invokes `INVOKE_CHANNELS.EXECUTE_TOOL`.
2. Electron main `local_backend_bridge.cjs` handles `execute-tool` and sends JSON-RPC `execute_tool`.
3. Python sidecar `local_backend.py` routes to `ToolRegistry.execute_tool("browser", args)`.
4. `tools/browser/browser_tool.py:execute_browser(...)` validates action and delegates to adapter.
5. `BrowserRuntimeAdapter.execute(...)` maps action to runtime/provider operation.
6. Runtime provider talks to `BrowserController` / Browser Use runtime and returns normalized action result.

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
- rejects actions outside `BROWSER_ROUTED_ACTIONS`
- resolves `get_browser_controller` lazily at execution time (avoids import-time Playwright dependency for adapter/parity-only test modules)
- converts adapter result to canonical `ToolResult`

### Layer 2: runtime adapter

`browser_adapter.py`:

- handles runtime surface actions (`connect`, `profiles`, canonical Browser Use actions)
- blocks removed aliases (`open`, `switch_tab`, `press`, `type`, `act`) with migration guidance
- passes canonical Browser Use actions through `execute_browser_use_action(...)`
- enforces connection preconditions for action families that require active session
- returns normalized `AdapterActionResult` with `success`, `error_code`, warnings, and payload

Important adapter constants:

- `BROWSER_USE_ACTIONS_REQUIRING_CONNECTION`

## Runtime Provider Selection

`browser_runtime.py:get_browser_runtime_provider(...)`:

- requires vendored `browser_use` package inside repo
- default runtime (unset env): `browser_use_native`
- accepted runtime env values (`WINDIE_BROWSER_USE_RUNTIME`): `browser_use`, `browser_use_native`
- any unknown runtime value raises runtime error

Vendoring enforcement:

- inserts `frontend/src/main/python/tools/browser` at front of `sys.path`
- purges non-vendored `browser_use*` modules from `sys.modules`
- asserts imported module path resolves inside vendored folder

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

## Browser Use Bridge Internals

`_BrowserUseActionBridge` in `browser_runtime.py` handles:

- lazy import of Browser Use tool registry and session classes
- Browser Use session creation tied to controller mode (`user_chrome`/`managed`)
- optional file-system sandbox root for Browser Use file actions
- extraction model/provider resolution from env or Windie runtime config

Extraction runtime env overrides:

- `WINDIE_BROWSER_USE_EXTRACTION_PROVIDER`
- `WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID`
- `WINDIE_BROWSER_USE_EXTRACTION_API_KEY`
- `WINDIE_BROWSER_USE_EXTRACTION_BASE_URL`

## Failure Surfaces and Diagnostics

Frequent failure points:

- sidecar bridge timeout in Electron (`execute-tool` call timeout)
- browser runtime provider import/path errors (vendored package missing/misaligned)
- CDP endpoint unavailable and Chrome auto-launch failure
- schema validation errors for malformed action payloads
- connection-required action invoked before `connect`

Where errors are normalized:

- adapter returns structured `AdapterActionResult.error_code`
- browser tool converts failures into `ToolResult.error_result(...)`
- local backend bridge maps JSON-RPC failures to `{ success: false, error }`

## Related Pages

- [Sidecar Browser Docs Hub](browser/README.md)
- [Sidecar Browser Chrome Docs Hub](browser/chrome/README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
