---
summary: "Implementation report for converging minimal chat pill send-preflight typing state onto one renderer resolver and a guarded Electron main preflight window path."
read_when:
  - When validating minimal chat pill send-preflight behavior or debugging typing indicators that disappear and reappear after send.
  - When changing shared live-turn presentation resolution, response overlay phase fallback, or SDK live-turn overlay intent guards.
title: "Live Turn Preflight Convergence Report"
---

# Live Turn Preflight Convergence Report

Status: implemented.

## Scope

This change fixes the minimal chat pill send gap where typing could appear,
disappear, and then reappear after pressing send.

The affected owner boundaries are:

- Renderer: one shared live-turn surface resolver decides whether local
  `send-preflight` still wins over SDK current-turn presentation.
- Electron main: native response-overlay fallback from `renderer-send-preflight`
  gets a temporary guard so stale SDK hidden intent cannot hide the native
  window before SDK awaiting/response intent arrives.
- SDK/backend/sidecar: unchanged.

No storage, API, persisted data, or migration behavior changed.

## Implemented

- Extended the shared renderer live-turn surface resolver to return
  `source`, `isBusy`, awaiting/response visibility, SDK presentation presence,
  preflight latch state, overlay intent, entries, turn refs, and guard refs.
- Moved the hidden-SDK preflight rule out of the response overlay hook and into
  the shared resolver.
- Updated the chat surface controller to prefer SDK presentation only when the
  shared resolver says local send preflight has been superseded.
- Added a `renderer-send-preflight` response-overlay guard in Electron main.
  Hidden SDK intent with a different stale guard is ignored while that guard is
  active.
- Made idle/hidden phase handling and surface-ownership suppression clear the
  temporary preflight guard, while SDK awaiting/response intent replaces it with
  the SDK turn guard.
- Added focused regression coverage for hidden SDK presentation during send,
  SDK awaiting supersession, preflight guard installation/clearing, and hidden
  SDK intent ignored during preflight.
- Follow-up: kept preflight latched over terminal/idle projections while
  `isSending=true`, covering the shorter gap before the optimistic new user row
  lands and the previous completed turn is still the latest projection.

## Validation

Passed:

```bash
cd frontend && npm run test -- LiveTurnSurfaceState ChatSurfaceController ResponseOverlayPhaseHandler SdkLiveTurnSurfaceController --runInBand
```

Passed:

```bash
cd frontend && npm run test -- ChatSurfaceController ChatBoxResponse.state ResponseOverlayPhaseHandler SdkLiveTurnSurfaceController ChatBoxOverlayMouseIgnore --runInBand
```

Passed:

```bash
cd frontend && npm run test -- LiveTurnSurfaceState --runInBand
```

Passed:

```bash
cd frontend && npm run lint
```

Passed after follow-up:

```bash
cd frontend && npm run test -- LiveTurnSurfaceState ChatSurfaceController ChatBoxResponse.state --runInBand
```

Passed after follow-up:

```bash
cd frontend && npm run test -- LiveTurnSurfaceState ChatSurfaceController ChatBoxResponse.state ResponseOverlayPhaseHandler SdkLiveTurnSurfaceController ChatBoxOverlayMouseIgnore --runInBand
```
