---
summary: "Deep reference for renderer response-overlay utility modules: shared phase-contract JSON parity, payload normalization rules, external-store listener integration, layout-mode resolution, and frame-size measurement semantics."
read_when:
  - When changing files under `frontend/src/renderer/features/chat/utils/overlay/*`.
  - When debugging overlay phase payload drops, renderer/main phase-contract drift, or response overlay sizing regressions.
title: "Response Overlay Utility Contract Reference"
---

# Response Overlay Utility Contract Reference

## Canonical Modules

- `frontend/src/shared/response_overlay_phase_contract.json`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhasePayload.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayLayoutMode.js`
- `frontend/src/renderer/features/chat/utils/overlay/overlayFrameSize.js`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`
- `frontend/src/main/ipc/ipc_overlay_phase_contract.cjs`
- `tests/frontend/ResponseOverlayPhaseContract.test.js`
- `tests/frontend/OverlayPhaseContractParity.test.js`
- `tests/frontend/ResponseOverlayPhasePayload.test.js`
- `tests/frontend/OverlayPhaseListener.test.js`
- `tests/frontend/UseResponseOverlayPhase.test.jsx`
- `tests/frontend/ResponseOverlayLayoutMode.test.js`
- `tests/frontend/OverlayFrameSize.test.js`

## Contract-Source Boundary

Shared phase/metadata source of truth:

- `frontend/src/shared/response_overlay_phase_contract.json`

Renderer contract adapter:

- `responseOverlayPhaseContract.js` reads JSON phases/metadata keys and derives:
  - `RESPONSE_OVERLAY_PHASE` enum object (`IDLE`, `AWAITING_FIRST_CHUNK`, `STREAMING`, `TOOL_CALL`, `TOOL_OUTPUT`, `COMPLETE`, `ERROR`)
  - `RESPONSE_OVERLAY_METADATA_KEYS`
  - validators/normalizers (`isResponseOverlayPhase`, string/number normalization helpers)

Main-process parity:

- `ipc_overlay_phase_contract.cjs` consumes the same JSON and generates parallel phase/metadata structures.
- parity tests enforce renderer and main stay in lockstep (`OverlayPhaseContractParity.test.js`).

## Payload Parse Contract

`parseResponseOverlayPhasePayload(payload)` rules:

1. reject non-object payloads and arrays
2. normalize `phase` with trim semantics
3. reject unknown phase values via `isResponseOverlayPhase(...)`
4. normalize optional fields:
  - string fields (`source`, `correlation_id`, `recovery_stage`, `failure_reason`) -> trimmed string or `undefined`
  - numeric fields (`attempt`, `max_attempts`) -> finite number or `undefined`
5. return normalized payload object or `null`

Result: listener/hook subscribers only observe validated phase transitions.

## Listener + Hook Integration Contract

`overlayPhaseListener.js` owns:

- phase snapshot state (`currentOverlayPhase`, initialized to `idle`)
- lazy IPC listener lifecycle
- store subscriber set for `useSyncExternalStore`

Important behavior:

- invalid payloads from IPC are ignored (no snapshot mutation, no notification)
- when last subscriber unsubscribes, listener cleanup resets snapshot back to `idle`

`useResponseOverlayPhase()` exposes this state via `useSyncExternalStore`, so both `ChatBox` and `ChatBoxResponse` share one transport subscription surface.

## Layout-Mode Resolver Contract

`resolveResponseOverlayLayoutMode({ showResponse, showAwaitingReply })`:

- `showResponse=true` -> `response`
- else if `showAwaitingReply=true` -> `awaiting-typing`
- else -> `hidden`

`isCompactHoverLayoutMode(mode)` is true only for `awaiting-typing`.

This classification feeds `set-responsebox-size` payload shape in `ChatBoxResponse`:

- `awaiting-typing` maps to compact-hover behavior and fixed typing frame height.

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
- [Overlay Phase Listener and Sync-Store Contract Reference](overlay_phase_listener_and_sync_external_store_contract_reference.md)
- [Response Overlay Phase Runtime Reference](response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](../chat/presentation/chatbox_component_split_and_overlay_pill_runtime_reference.md)
