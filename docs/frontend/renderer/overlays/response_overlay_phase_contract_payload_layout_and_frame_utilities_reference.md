---
summary: "Deep reference for renderer response-overlay utility modules: shared phase-contract JSON parity, removed responseOverlayPhasePayload parser behavior, layout-mode resolution, and frame-size measurement semantics."
read_when:
  - When changing `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js` or `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`.
  - When changing files under `frontend/src/renderer/features/chat/utils/overlay/*`.
  - When debugging overlay phase payload drops, renderer/main phase-contract drift, or response overlay sizing regressions.
  - When resolving stale references to removed `responseOverlayPhasePayload.js` or `ResponseOverlayPhasePayload.test.js` files.
title: "Response Overlay Utility Contract Reference"
---

# Response Overlay Utility Contract Reference

## Canonical Modules

- `frontend/src/shared/response_overlay_phase_contract.json`
- `frontend/src/shared/response_overlay_layout_contract.json`
- `frontend/src/shared/overlay_turn_lifecycle_contract.json`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopResponseOverlayLayoutRuntime.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayTurnLifecycleContract.js`
- `frontend/src/main/ipc/ipc_overlay_phase_contract.cjs`
- `tests/frontend/ResponseOverlayPhaseContract.test.js`
- `tests/frontend/OverlayPhaseContractParity.test.js`
- `tests/frontend/ResponseOverlayLayoutMode.test.js`
- `tests/frontend/OverlayFrameSize.test.js`

## Contract-Source Boundary

Shared phase/metadata source of truth:

- `frontend/src/shared/response_overlay_phase_contract.json`

Renderer contract adapter:

- `desktopResponseOverlayPhaseRuntime.js` reads JSON phases/metadata keys and derives:
  - `RESPONSE_OVERLAY_PHASE` enum object (`IDLE`, `AWAITING_FIRST_CHUNK`, `STREAMING`, `TOOL_CALL`, `TOOL_OUTPUT`, `COMPLETE`, `ERROR`)
  - renderer preflight guard-ref constant; main process owns the preflight source

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

## Turn Lifecycle Contract

Shared lifecycle source of truth:

- `frontend/src/shared/overlay_turn_lifecycle_contract.json`

Renderer adapters:

- `overlayTurnLifecycleContract.js` exposes lifecycle constants:
  - `IDLE`
  - `PREFLIGHT`
  - `AWAITING`
  - `ACTIVE`
  - `TERMINAL`
- `overlayTurnLifecycleState.js` resolves renderer-local send state plus main-process overlay phase into one canonical lifecycle.

Important behavior:

- renderer-local `isSending` is treated as `preflight` until the main-process phase advances
- `awaiting-first-chunk` resolves to `awaiting`
- `streaming` / `tool-call` / `tool-output` resolve to `active`
- `complete` / `error` resolve to `terminal` unless a newer send has already staged locally, in which case the lifecycle stays `preflight`

Purpose:

- keep `useCurrentTurnPresentationState`, `ChatBox`, `ChatInterface`, and
  `ChatBoxResponse` on one shared turn-lifecycle contract derived from SDK
  current-turn projection instead of each reducing overlay phase independently

## Layout-Mode Resolver Contract

`resolveResponseOverlayLayoutMode({ showResponse, showAwaitingReply })`:

- `showResponse=true` -> `response`
- else if `showAwaitingReply=true` -> `awaiting-typing`
- else -> `hidden`

`isCompactHoverLayoutMode(mode)` is true only for `awaiting-typing`.

This classification feeds `set-responsebox-size` payload shape in `ChatBoxResponse`:

- `awaiting-typing` maps to compact-hover behavior and fixed typing frame height.

## Layout Constant Contract

Shared layout source of truth:

- `frontend/src/shared/response_overlay_layout_contract.json`

Renderer adapter:

- `desktopResponseOverlayLayoutRuntime.js` exposes:
  - `RESPONSE_OVERLAY_LAYOUT.AWAITING_FRAME_HEIGHT`
  - `RESPONSE_OVERLAY_LAYOUT.RESPONSE_FIXED_HEIGHT`

Current fixed values:

- awaiting typing frame height: `24`
- response frame height: `236`

Purpose:

- keep renderer CSS/JS and main-process compact restore logic aligned on one set of response-overlay size constants instead of duplicating raw numbers across windows and tests

## Frame Measurement Contract

`getRoundedFrameSize(element)`:

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
