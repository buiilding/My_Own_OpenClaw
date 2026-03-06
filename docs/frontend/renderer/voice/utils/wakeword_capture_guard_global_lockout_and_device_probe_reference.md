---
summary: "Deep reference for renderer wakeword capture guard utility: global lockout persistence, missing-device detection heuristics, and audio-input availability probing contract."
read_when:
  - When changing `frontend/src/renderer/features/voice/utils/wakewordCaptureGuard.ts`.
  - When debugging missing-device wakeword lockout state across remounts or device-reconnect retry behavior.
title: "Wakeword Capture Guard Utility Reference"
---

# Wakeword Capture Guard Utility Reference

## Canonical Modules

- `frontend/src/renderer/features/voice/utils/wakewordCaptureGuard.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `tests/frontend/voice/WakewordDetectionHook.test.ts`

## Utility Ownership Boundary

`wakewordCaptureGuard.ts` is the single renderer utility owner for wakeword missing-device lockout persistence.

It owns:

- guard shape contract:
  - `missingDeviceLocked: boolean`
  - `nextRetryAt: number`
- global persistence key:
  - `globalThis.__windieWakewordCaptureGuard`
- helper functions for guard lifecycle and device heuristics.

`useWakewordDetection` consumes this utility but does not own global object creation semantics.

## Guard Lifecycle Contract

`getWakewordCaptureGuard()`:

- returns existing global guard when present
- creates default guard if missing:
  - `missingDeviceLocked=false`
  - `nextRetryAt=0`

`clearWakewordCaptureGuard(guard)`:

- mutates passed guard object in place to default unlocked values

This mutation-based contract preserves shared-reference behavior across hook remounts.

## Missing-Device Error Heuristic Contract

`isMissingAudioDeviceError(error)` returns true when either:

- `error.name === "NotFoundError"`
- lowercase error message contains `"requested device not found"`

All other errors are treated as generic capture failures.

## Audio-Input Availability Probe Contract

`hasAvailableAudioInputDevice()`:

- returns `false` when `navigator.mediaDevices` or `enumerateDevices` is unavailable
- attempts `enumerateDevices()`
- returns `true` only when at least one device has `kind === "audioinput"`
- returns `false` on enumeration errors

This keeps reconnect retry logic fail-closed under platform/API failures.

## Hook Integration Points

`useWakewordDetection` uses utility helpers to:

- bootstrap persisted guard state on hook module load
- clear lockout when user preference disables wakeword
- re-check lockout on `devicechange` and restart capture when audio input appears
- classify capture failures into missing-device vs generic paths

## Test-Locked Invariants

`tests/frontend/voice/WakewordDetectionHook.test.ts` locks utility-driven behavior:

- lockout persists across hook remounts via shared global guard state
- suppression-only toggles do not clear lockout
- explicit preference disable clears lockout
- `devicechange` + new audioinput availability retries capture

## Drift Hotspots

1. Changing global key names without hook/tests/docs updates breaks persistence across remounts.
2. Weakening missing-device heuristics can classify NotFound errors as generic failures and skip lockout logic.
3. Returning optimistic true from availability probes on API failures can cause noisy retry loops.
4. Replacing in-place clear semantics with object replacement can break shared-ref behavior held by hook refs.

## Related Pages

- [Frontend Renderer Voice Utils Docs Hub](README.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](../wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Voice Capture and Wakeword Controller Reference](../../voice_capture_and_wakeword_controller_reference.md)
