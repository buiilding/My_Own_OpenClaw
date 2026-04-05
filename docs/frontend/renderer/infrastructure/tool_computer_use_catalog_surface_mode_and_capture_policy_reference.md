---
summary: "Deep reference for renderer computer-use tool catalog ownership: canonical interactive/capture-only tool-name sets, surface-mode resolution coupling, and auto-capture classification behavior."
read_when:
  - When changing computer-use tool-name handling in renderer surface orchestration or capture policy paths.
  - When debugging mismatches where tool execution mode/capture behavior differs from expected interactive vs screenshot flows.
title: "Tool Computer-Use Catalog, Surface Mode, and Capture Policy Reference"
---

# Tool Computer-Use Catalog, Surface Mode, and Capture Policy Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/mode.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`
- `tests/frontend/ToolComputerUseCatalog.test.ts`
- `tests/frontend/ToolRunnerSurface.test.ts`

## Catalog Ownership Contract

`ToolComputerUseCatalog.ts` is the single source of truth for renderer-side computer-use tool names.

Exports:

- `INTERACTIVE_COMPUTER_USE_TOOLS`
- `CAPTURE_ONLY_COMPUTER_USE_TOOLS`
- `STANDARD_COMPUTER_USE_TOOLS` (interactive + capture-only concatenation)

Current canonical names:

- interactive: `mouse_control`, `keyboard_control`, `scroll_control`, `click`, `type`, `scroll`
- capture-only: `screenshot`, `switch_window`, `wait`

Catalog arrays are frozen (`Object.freeze`) to prevent runtime mutation.

## Unified Wrapper Exclusion Contract

Renderer catalog intentionally excludes unified `computer_use`.

Rationale:

- backend/sidecar may expose unified tool schema for model-facing contracts
- renderer execution/surface logic operates on concrete dispatched tool names
- keeping renderer catalog concrete avoids mode/capture drift when `computer_use` is used upstream as a wrapper

Test-backed invariant:

- `tests/frontend/ToolComputerUseCatalog.test.ts::keeps renderer execution catalog concrete and excludes unified computer_use wrapper`

## Surface Mode Resolution Coupling

`surfaceOrchestrator/mode.ts` constructs set lookups from the catalog:

- `INTERACTIVE_COMPUTER_TOOL_NAMES = new Set(INTERACTIVE_COMPUTER_USE_TOOLS)`
- `CAPTURE_ONLY_COMPUTER_TOOL_NAMES = new Set(CAPTURE_ONLY_COMPUTER_USE_TOOLS)`

`resolveToolSurfaceMode(toolName, args)` behavior:

- normalizes tool name (`trim().toLowerCase()`)
- capture-only names -> `screenshot`
- interactive names -> `interactive`
- all others -> `none`
- `browser` always resolves to `none` (explicit non-handoff policy in renderer mode resolver)

`resolveBundleSurfaceMode(tools)` precedence:

1. any interactive tool -> `interactive`
2. else any screenshot-mode tool -> `screenshot`
3. else -> `none`

## Auto-Capture Classification Coupling

`ToolExecutionCapture.isComputerUseTool(toolName, args)` uses `STANDARD_COMPUTER_USE_TOOLS` for classification.

Behavior:

- standard catalog tool name -> treated as computer-use tool
- plus special case: `run_shell_command` with numeric positive `args.wait` is treated as capture-worthy

This classification drives `ensureAutoCapture(...)` capture decisions and system-state-only fallback behavior.

## Wait/Delay Semantics Connected to Catalog Use

When a tool is classified as computer-use (or is `screenshot`):

- default wait: `2s` for most computer tools
- screenshot default wait: `0s`
- explicit waits override defaults:
  - `wait.seconds`
  - otherwise generic `args.wait`

These values affect both full screenshot capture and system-state-only capture fallback.

## Drift Hotspots

1. Adding/removing tool names outside `ToolComputerUseCatalog.ts` can desync surface mode and capture behavior.
2. Removing alias names (`click`, `type`, `scroll`) can regress compatibility for action-normalized dispatch paths.
3. Adding `computer_use` directly into renderer catalog can cause wrapper/concrete mode ambiguity.
4. Changing bundle mode precedence can break expected screenshot collapse/interactive handling in mixed bundles.

## Related Docs

- [Tool Execution Service and Hook Runtime Reference](tool_execution_service_and_hook_runtime_reference.md)
- [Tool Execution and Streaming](../../runtime/tool_execution_and_streaming.md)
- [Frontend Renderer Infrastructure Docs Hub](README.md)
