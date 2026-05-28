---
summary: "Deep reference for computer-use tool catalog ownership: concrete tool-name sets, legacy renderer surface-mode resolution, and SDK/main post-action capture classification behavior."
read_when:
  - When changing computer-use tool-name handling in SDK/main capture policy paths or legacy renderer surface-mode helpers.
  - When debugging mismatches where tool execution mode/capture behavior differs from expected interactive vs screenshot flows.
title: "Tool Computer-Use Catalog, Surface Mode, and Capture Policy Reference"
---

# Tool Computer-Use Catalog, Surface Mode, and Capture Policy Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/services/ToolComputerUseCatalog.ts`
- `frontend/src/renderer/infrastructure/services/surfaceOrchestrator/mode.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/cjs/tools/ToolExecutionCoordinator.js`
- `tests/frontend/ToolComputerUseCatalog.test.ts`
- `tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs`
- `tests/frontend/WindieSdkDesktopAgent.test.ts`

## Catalog Ownership Contract

`ToolComputerUseCatalog.ts` is the shared concrete-name catalog for renderer-side
display/capture helpers. Backend tool execution is not owned by the renderer; live
computer-use execution flows through SDK/main and the Electron sidecar bridge.

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

`surfaceOrchestrator/mode.ts` constructs set lookups from the catalog for legacy
renderer capture helpers:

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

## Post-Action Capture Classification Coupling

`ToolExecutionCoordinator` owns post-action capture classification for SDK/main
tool execution. Its capture-worthy tool set must stay aligned with the concrete
computer-use names used by Electron main and the sidecar bridge.

Behavior:

- standard catalog tool name -> treated as computer-use tool
- plus special case: `run_shell_command` with numeric positive `args.wait` is treated as capture-worthy

This classification drives SDK post-action screenshot behavior:

- single computer-use tools merge one screenshot into the `tool-result` data
- atomic bundles capture once after all bundle steps
- bundles with an explicit `screenshot` step promote that screenshot to the top-level bundle result instead of taking a duplicate capture

## Wait/Delay Semantics Connected to Catalog Use

When a tool is classified as capture-worthy:

- default wait: `2s` for most computer tools
- explicit waits override defaults:
  - `wait.seconds`
  - otherwise generic `args.wait`

These values affect the SDK-owned post-action screenshot. Bundle capture waits once, using the maximum resolved wait among successful capture-worthy steps.

## Drift Hotspots

1. Adding/removing tool names outside `ToolComputerUseCatalog.ts`, `ToolExecutionCoordinator`, and Electron main's local tool surface-prep set can desync display helpers, post-action capture, and dashboard-to-pill handoff behavior.
2. Removing alias names (`click`, `type`, `scroll`) can regress compatibility for action-normalized dispatch paths.
3. Adding `computer_use` directly into renderer catalog can cause wrapper/concrete mode ambiguity.
4. Changing bundle mode precedence can break expected screenshot collapse/interactive handling in mixed bundles.

## Related Docs

- [Tool Execution and Streaming](../../runtime/tool_execution_and_streaming.md)
- [Frontend Renderer Infrastructure Docs Hub](README.md)
