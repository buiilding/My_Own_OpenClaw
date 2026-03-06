---
summary: "Deep reference for renderer overlay phase listener internals: parsed payload gate, single store-subscriber set, lazy IPC subscription lifecycle, and `useSyncExternalStore` integration."
read_when:
  - When changing `overlayPhaseListener.js`, `useResponseOverlayPhase.js`, or response-overlay phase payload parsing.
  - When debugging stale overlay phase snapshots, duplicate IPC listeners, or hook subscription cleanup behavior in chatbox overlays.
title: "Overlay Phase Listener and Sync-Store Contract Reference"
---

# Overlay Phase Listener and Sync-Store Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/overlay/overlayPhaseListener.js`
- `frontend/src/renderer/features/chat/hooks/useResponseOverlayPhase.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhasePayload.js`
- `frontend/src/renderer/features/chat/utils/overlay/responseOverlayPhaseContract.js`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `tests/frontend/OverlayPhaseListener.test.js`
- `tests/frontend/UseResponseOverlayPhase.test.jsx`

## Ownership Boundary

`overlayPhaseListener.js` is the shared renderer runtime owner for response-overlay phase transport state.

It owns:

- one lazily-attached IPC listener on `ON_CHANNELS.RESPONSE_OVERLAY_PHASE`
- current phase snapshot storage (`currentOverlayPhase`)
- callback fan-out to store subscribers

It does not own:

- payload parsing rules (delegated to `parseResponseOverlayPhasePayload`)
- component-specific UI transitions (`ChatBox`, `ChatBoxResponse`)

## Payload Gate and Snapshot Semantics

Inbound payload flow:

1. IPC callback receives raw payload.
2. `parseResponseOverlayPhasePayload(payload)` validates/normalizes.
3. invalid payloads are dropped (no phase write, no notifications).
4. valid payload updates `currentOverlayPhase`.
5. listener notifies store subscribers.

Snapshot contract:

- default startup snapshot is `RESPONSE_OVERLAY_PHASE.IDLE`.
- `getResponseOverlayPhaseSnapshot()` returns the last accepted parsed phase.
- invalid payloads never mutate snapshot.

## Store Subscriber Set

Listener maintains one registry:

- `storeSubscribers`: callback shape `() => void` for external-store change pings

Public API:

- `subscribeResponseOverlayPhaseStore(onStoreChange)`:
  - adds callback to `storeSubscribers`
  - ensures IPC subscription
  - returns unsubscribe closure

## Lazy IPC Subscription Lifecycle

`ensureIpcSubscription()` contract:

- if already subscribed, no-op.
- otherwise subscribes once and stores remover in `removeIpcListener`.

`disposeIpcSubscriptionIfIdle()` contract:

- unsubscribes IPC only when `storeSubscribers` is empty.
- safe when remover is absent (`removeIpcListener?.()`).
- resets remover handle to `null` after cleanup.

Result:

- any number of hook consumers share one IPC listener.
- listener is released when last subscriber unmounts/unsubscribes.

## `useSyncExternalStore` Hook Contract

`useResponseOverlayPhase()` implementation:

- `subscribe`: `subscribeResponseOverlayPhaseStore`
- `getSnapshot`: `getResponseOverlayPhaseSnapshot`
- `getServerSnapshot`: same snapshot getter

Behavioral guarantees:

- hook re-renders only on store subscriber notifications from accepted payloads.
- invalid phase payloads do not trigger hook updates.
- unmount cleanup removes store subscriber and can release IPC listener if no other subscribers remain.

## Consumer Integration Notes

`ChatBox.jsx` and `ChatBoxResponse.jsx` both consume `useResponseOverlayPhase()`:

- phase feeds `useChatLoopUiState(...)` projections.
- `ChatBoxResponse` additionally resets close-dismiss state when phase returns to `awaiting-first-chunk`.

Because both components can mount together, shared-listener ownership prevents duplicate renderer-side IPC listeners.

## Test-Locked Invariants

`tests/frontend/OverlayPhaseListener.test.js` covers:

- valid parsed phase forwarding (including metadata normalization edge cases)
- invalid/unknown phase rejection
- store subscriber snapshot updates only for valid payloads
- safe unsubscribe when IPC registration returns no cleanup fn

`tests/frontend/UseResponseOverlayPhase.test.jsx` covers:

- initial `idle` snapshot
- phase updates reflected via hook
- invalid payloads leave hook snapshot unchanged
- unmount executes subscription cleanup path

## Drift Hotspots

1. Reintroducing separate callback and store subscriber channels can create duplicate event processing and inconsistent cleanup.
2. Updating snapshot before parse validation would allow unknown phases to leak into hook consumers.
3. Removing lazy unsubscribe logic can leak long-lived IPC listeners across overlay remounts.
4. Emitting store notifications before snapshot mutation would break `useSyncExternalStore` consumers expecting snapshot-before-notify semantics.

## Related Pages

- [Response Overlay Phase Runtime Reference](response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Response Overlay Utility Contract Reference](response_overlay_phase_contract_payload_layout_and_frame_utilities_reference.md)
- [Frontend Renderer Overlay Docs Hub](README.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
