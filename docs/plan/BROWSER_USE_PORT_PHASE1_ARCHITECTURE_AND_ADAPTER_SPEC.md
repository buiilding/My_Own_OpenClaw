---
summary: "Phase 1 architecture boundary and adapter interface spec for Browser Use migration."
read_when:
  - Implementing Browser Use adapter wiring in Phase 2.
  - Reviewing WindieOS-vs-Browser-Use ownership boundaries.
  - Validating normalized adapter return contracts before coding action handlers.
---

# Browser Use Port Phase 1 Architecture and Adapter Spec

Phase completed: **February 16, 2026**

## Scope

Define the target architecture for Browser Use execution inside WindieOS without changing WindieOS orchestration ownership.

## Ownership Boundary (Authoritative)

| Layer | Owns | Must not own |
| --- | --- | --- |
| Backend agent/runtime (`backend/src/agent/*`, `backend/src/tools/*`) | Tool schema exposure, parser validation, tool policy filtering, request correlation IDs, tool-result orchestration | Browser automation execution internals |
| Frontend renderer/main (`frontend/src/renderer/*`, `frontend/src/main/*.cjs`) | Tool-call transport to sidecar, timeout/capture flow, tool-result return to backend | Browser action semantics |
| Sidecar tool registry (`frontend/src/main/python/tools/registry.py`) | Routing `browser_control` to a single browser-domain entrypoint | LLM orchestration/history ownership |
| Browser tool entrypoint (`frontend/src/main/python/tools/browser/browser_tool.py`) | Action parsing/validation, compatibility payload shaping to `ToolResult` | Direct Playwright-heavy action internals after migration |
| Browser Use adapter (`frontend/src/main/python/tools/browser_use_adapter/*`) | Browser session lifecycle + action execution via Browser Use primitives, deterministic normalized action results | WindieOS interaction loop, prompt/history, tool policy |

Hard rule: Browser Use `Agent` runtime is not used in WindieOS turn orchestration.

## Sequence Diagram (Phase 1 Target)

```text
LLM
  -> Backend ToolRegistry (schema already exposed)
  -> RemoteBrowserTool.execute_remote(args)
  -> backend emits tool-call event (tool=browser_control, request_id)

Backend WebSocket
  -> Renderer ToolExecutionService.invokeTool("browser_control", args)
  -> Electron local_backend_bridge.cjs (JSON-RPC execute_tool)
  -> Python sidecar LocalBackend._handle_execute_tool
  -> Sidecar ToolRegistry.execute_tool("browser_control", args)
  -> browser_tool.execute_browser_control(args)
  -> BrowserUseAdapter.execute(action, args)
  -> Browser Use session/runtime primitives
  -> BrowserUseAdapter returns normalized AdapterActionResult
  -> browser_tool maps AdapterActionResult -> ToolResult
  -> sidecar returns JSON-RPC tool result
  -> renderer sends tool-result event to backend
  -> backend ToolResultOrchestrator/ToolResultHandler
```

## Adapter Interface Spec

Phase 2 implementation should use this interface contract.

```python
from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Protocol

MigrationDecision = Literal["port", "compat", "deprecate"]

@dataclass(slots=True)
class AdapterActionResult:
    success: bool
    action: str
    decision: MigrationDecision
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    warnings: list[str] = field(default_factory=list)
    deprecation: str | None = None

class BrowserUseAdapter(Protocol):
    async def execute(
        self,
        action: str,
        args: Mapping[str, Any],
    ) -> AdapterActionResult: ...

    async def connect(
        self,
        *,
        mode: Literal["user_chrome", "managed"],
        cdp_url: str | None,
        headless: bool,
        executable_path: str | None,
    ) -> AdapterActionResult: ...

    async def status(self) -> AdapterActionResult: ...
    async def close(self) -> AdapterActionResult: ...
```

## Normalized Return Schema

Every adapter call returns `AdapterActionResult` and never leaks raw Browser Use objects upward.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `success` | `bool` | yes | `True` for completed action, `False` for deterministic error/deprecation paths |
| `action` | `str` | yes | Canonical `browser_control` action name |
| `decision` | `port|compat|deprecate` | yes | Must match Phase 0 parity ledger decision |
| `data` | `dict[str, Any]` | yes | WindieOS-compatible payload fields for success paths |
| `error` | `str \| None` | yes | User-visible deterministic failure reason when `success=False` |
| `error_code` | `str \| None` | yes | Machine-readable failure class (for logs/tests) |
| `warnings` | `list[str]` | yes | Non-fatal compatibility notes |
| `deprecation` | `str \| None` | yes | Required when `decision="deprecate"` |

## Adapter Error Codes (Initial Set)

- `BROWSER_NOT_CONNECTED`
- `INVALID_ARGUMENT`
- `TAB_NOT_FOUND`
- `REF_NOT_FOUND`
- `ACTION_UNSUPPORTED`
- `ACTION_DEPRECATED`
- `ACTION_TIMEOUT`
- `BROWSER_RUNTIME_ERROR`

## Mapping Rule to Sidecar `ToolResult`

`browser_tool.execute_browser_control` remains the compatibility boundary:

1. On `AdapterActionResult.success=True`:
   - return `ToolResult.success_result(adapter_result.data)`
2. On `AdapterActionResult.success=False`:
   - return `ToolResult.error_result(adapter_result.error or "Action failed")`
3. Keep WindieOS payload keys currently consumed by frontend formatter (for example `snapshot`, `result`, `message`, `action`).

## Action Grouping for Phase 2 Routing

- Core `port` first: `navigate`, `open`, `press`, `scroll`, `get_tabs`, `switch_tab`, `evaluate`, `close`.
- Core `compat` in same adapter: `connect`, `status`, `snapshot`, `extract`, `click`, `type`, `screenshot`, `wait`, `act`.
- Advanced `compat` follows same normalized envelope.
- Advanced `deprecate`: `trace_start`, `trace_stop` return explicit `ACTION_DEPRECATED` with mitigation text.

## Phase 1 Exit-Criteria Check

- Architecture flow and sequence are explicitly documented.
- Ownership boundary between WindieOS orchestration and Browser Use runtime is explicit.
- Adapter method signatures and normalized return schema are defined for Phase 2 implementation.
