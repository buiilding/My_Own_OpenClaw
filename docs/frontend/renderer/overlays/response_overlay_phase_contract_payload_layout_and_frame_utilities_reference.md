---
summary: "Deep reference for renderer response-overlay utility modules: shared phase-contract JSON parity, removed responseOverlayPhasePayload parser behavior, layout-mode resolution, and frame-size measurement semantics."
read_when:
  - When changing `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`, `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`, or `frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime.ts`.
  - When debugging overlay phase payload drops, renderer/main phase-contract drift, or response overlay sizing regressions.
  - When resolving stale references to removed `responseOverlayPhasePayload.js` or `ResponseOverlayPhasePayload.test.js` files.
title: "Response Overlay Utility Contract Reference"
---

# Response Overlay Utility Contract Reference

## Canonical Modules

- `frontend/src/shared/response_overlay_phase_contract.json`
- `frontend/src/shared/response_overlay_layout_contract.json`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayViewRuntime.ts`
- `frontend/src/main/ipc/ipc_overlay_phase_contract.cjs`
- `tests/frontend/ResponseOverlayPhaseContract.test.js`
- `tests/frontend/OverlayPhaseContractParity.test.js`
- `tests/frontend/ResponseOverlayLayoutMode.test.js`
- `tests/frontend/OverlayFrameSize.test.js`

## Contract-Source Boundary

Shared phase/metadata source of truth:

- `frontend/src/shared/response_overlay_phase_contract.json`

Renderer contract adapter:

- `desktopResponseOverlayPhaseRuntime.js` reads JSON phases/metadata keys while
  keeping the raw phase map, preflight guard ref, and individual helper
  functions private behind `DesktopResponseOverlayPhaseRuntime`.
- `getIdleResponseOverlayPhase()`,
  `getAwaitingFirstChunkResponseOverlayPhase()`,
  `getStreamingResponseOverlayPhase()`, `getToolCallResponseOverlayPhase()`,
  `getToolOutputResponseOverlayPhase()`, `getCompleteResponseOverlayPhase()`,
  and `getErrorResponseOverlayPhase()` expose semantic phase values for
  renderer app-runtime callers.
- `getResponseOverlayPreflightGuardRef()` exposes the renderer send-preflight
  guard identity without exporting a raw constant.
- `getResponseOverlayPhaseValues()` and `getResponseOverlayPhaseMap()` expose
  parity snapshots for contract tests.
- `isAwaitingFirstChunkResponseOverlayPhase(...)` and
  `isStreamingResponseOverlayPhase(...)` remain behind the facade for
  phase-contract tests and legacy phase callers; current-turn busy/awaiting
  surface state is mapped from `DesktopVisibleTurnLifecycleRuntime`.
- `DesktopResponseOverlayViewRuntime.resolveResponseOverlayViewContract(...)`
  owns response-overlay visibility and layout intent resolution while keeping
  the raw view-contract resolver private behind the renderer app-runtime
  facade.

Main-process parity:

- `ipc_overlay_phase_contract.cjs` consumes the same JSON and generates parallel phase/metadata structures.
- parity tests enforce renderer and main stay in lockstep (`OverlayPhaseContractParity.test.js`).

## Phase Payload Boundary

React chat surfaces do not parse generic phase IPC payloads for active runtime
state. Dashboard, minimal pill, and response overlay render from SDK
`currentTurnProjection`; main-process overlay phase remains a native
window/layout and diagnostics signal.

Payload validation for native phase events belongs to Electron main phase
state/events plus the shared JSON-backed contract. Renderer utility tests should
cover phase identity parity, lifecycle mapping, layout modes, and frame-size
measurement, not a second renderer payload parser.

### Removed Renderer Phase Payload Parser

The renderer-local `responseOverlayPhasePayload.js` parser and
`ResponseOverlayPhasePayload.test.js` were removed. Current overlay phase
payload behavior is owned by:

- shared JSON contracts for phase and metadata keys
- renderer/main parity adapters
- Electron main phase state/events for native window/layout signaling
- SDK `currentTurnProjection` for chat runtime state

Searches for the removed parser or test should route here.

## Deleted Turn Lifecycle Adapter

The renderer no longer has `overlay_turn_lifecycle_contract.json` or
`desktopOverlayTurnLifecycleRuntime.js`. Response overlay state consumes
`DesktopVisibleTurnLifecycleRuntime` output and
`DesktopResponseOverlayViewRuntime.resolveResponseOverlayViewContract(...)`
directly. Searches for `getIdleOverlayTurnLifecycle(...)`,
`isOverlayTurnLifecycleBusy(...)`, or overlay lifecycle names such as
`preflight` should route to the visible lifecycle owner instead of adding a new
adapter layer.

## Layout-Mode Resolver Contract

`DesktopResponseOverlayLayoutRuntime.resolveResponseOverlayLayoutMode({ responseVisible, awaitingVisible })`:

- `responseVisible=true` -> `response`
- else if `awaitingVisible=true` -> `awaiting-typing`
- else -> `hidden`

`DesktopResponseOverlayLayoutRuntime.isCompactHoverLayoutMode(mode)` is true only for `awaiting-typing`.
`DesktopResponseOverlayLayoutRuntime.getHiddenResponseOverlayLayoutMode()`,
`DesktopResponseOverlayLayoutRuntime.isVisibleResponseOverlayLayoutMode(mode)`,
`DesktopResponseOverlayLayoutRuntime.resolveResponseOverlayNativeMode(mode)` keep renderer feature code on
behavior-level checks instead of importing raw layout-mode tables.

This classification feeds `set-responsebox-size` payload shape in `ChatBoxResponse`:

- `awaiting-typing` maps to compact-hover behavior and fixed typing frame height.

## Layout Constant Contract

Shared layout source of truth:

- `frontend/src/shared/response_overlay_layout_contract.json`

Renderer adapter:

- `DesktopResponseOverlayLayoutRuntime` exposes:
  - `getResponseOverlayAwaitingFrameHeight()`
  - `getResponseOverlayFixedHeight()`
  - raw JSON-derived layout constants remain private to the adapter

Current fixed values:

- awaiting typing frame height: `24`
- response frame height: `236`

Purpose:

- keep renderer CSS/JS and main-process compact restore logic aligned on one set of response-overlay size constants instead of duplicating raw numbers across windows and tests

## Frame Measurement Contract

`DesktopResponseOverlayLayoutRuntime.getRoundedFrameSize(element)`:

- returns `null` when no measurable element/bounds exist
- uses max of `getBoundingClientRect`, `scroll*`, and `offset*` dimensions
- applies `Math.ceil(...)` and minimum `1x1` clamp

Purpose:

- avoids 1px clipping from fractional layout bounds while keeping deterministic integer IPC sizes.

## Drift Hotspots

1. Modifying renderer phase constants directly (instead of JSON contract) can desynchronize renderer/main IPC behavior.
2. Weakening payload parser phase validation can leak invalid states into loop UI reducers.
3. Removing idle-reset on last unsubscribe can preserve stale phase across overlay remounts.
4. Reverting frame-size computation to rect-only math can reintroduce clipping and oscillating resize chatter.

## Related Pages

- [Frontend Renderer Overlay Docs Hub](README.md)
- [Response Overlay Phase Runtime Reference](response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](../chat/presentation/chatbox_component_split_and_overlay_pill_runtime_reference.md)
