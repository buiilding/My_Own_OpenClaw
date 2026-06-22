---
summary: "Deep reference for renderer wakeword detection: IPC enable/disable sequencing, readiness-gated capture lifecycle, confidence threshold and cooldown policy, and generation-guarded audio resource teardown."
read_when:
  - When changing `useWakewordDetection` start/stop semantics or wakeword event filtering.
  - When debugging duplicate wakeword triggers, readiness drift, or stale microphone capture resources after toggles.
title: "Wakeword Detection IPC Capture and Cooldown Reference"
---

# Wakeword Detection IPC Capture and Cooldown Reference

## Canonical Modules

- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts`
- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/app/runtime/desktopWakewordEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `tests/frontend/voice/WakewordDetectionHook.test.ts`

## Activation Gate

`WakewordController` feeds `wakewordActive` from app config into `useWakewordDetection(...)`.

`wakewordActive` is computed in `AppConfigProvider`:

- `wakewordEnabled` (persisted `config.wakeword_enabled` user preference)
- `wakewordSuppressed` (runtime suppression from
  `DesktopVoiceRuntimeClient.onWakewordToggleState(...)`)
- `wakewordActive = wakewordEnabled && !wakewordSuppressed`

Detection callback behavior:

1. send backend `wakeword-detected` signal via `DesktopVoiceRuntimeClient`
2. invoke `show-chatbox` through IPC with `reason="wakeword"` so Electron main
   treats the wakeword as an intentional summon even when the user previously
   closed the minimal chat pill

Controller wiring:

- `WakewordController` passes `wakewordActive` as hook enable flag
- onboarding does not mount `WakewordController`, so this flow starts only after startup resolves to a dashboard surface
- callback side effects are centralized in one app-level owner:
  - backend `wakeword-detected` API call
  - `show-chatbox` IPC invoke

## IPC Channel Contract

Renderer send channels used:

- `wakeword-enable`
- `wakeword-disable`
- `wakeword-audio-chunk`

Renderer subscribe channels used:

- `wakeword-detected`
- `wakeword-status`

`DesktopVoiceRuntimeClient` owns channel subscription and raw bridge payload
normalization for detection and readiness values. `useWakewordBridgeEvents`
owns renderer subscription/update policy for those values, and
`useWakewordDetection` owns capture lifecycle and enable/disable orchestration.
The hook requests enable on startup to obtain/refresh readiness status.

## Readiness-Gated Capture Lifecycle

Capture starts only when:

- `enabled` is true
- `isReady` from `wakeword-status` is true
- capture is not already running

Capture stops when:

- disabled
- service becomes not ready
- hook unmounts

On disable path, hook also:

- resets cooldown timestamp
- sends explicit `wakeword-disable` to clear service buffers

## Capture Start + Retry Guard Contract

`startAudioCapture()` no-ops when any guard is active:

- capture already running (`isCapturingRef`)
- capture startup already in-flight (`isStartingCaptureRef`)
- missing-device lock enabled (`missingDeviceLockRef`)
- retry delay not elapsed (`Date.now() < nextCaptureRetryAtRef`)

Retry-delay constant:

- `CAPTURE_RETRY_DELAY_MS = 3000`
- `MISSING_DEVICE_RETRY_DELAY_MS = 60000`

Failure behavior:

- missing-device errors set lock + long retry timestamp (`60s`) to suppress repeated startup/error loops while no mic exists
- other capture errors still use short retry timestamp (`3s`)
- local failure marks `localCaptureErrorRef=true` to keep local capture errors sticky

## Generation Guard Against Async Races

`captureGenerationRef` increments on start/stop transitions.

`startAudioCapture` captures the current generation and aborts setup when generation changes mid-await:

- stops just-opened tracks
- closes just-opened audio context safely

This prevents stale async setup from reviving capture after a stop request.

## Audio Capture and Transport

Capture setup flows through
`DesktopVoiceAudioInputDeviceRuntime.requestAudioInputStream(...)` and
`DesktopVoiceAudioInputDeviceRuntime.createAudioInputContext(...)`, so browser
media-device and AudioContext adapter mechanics stay out of the wakeword hook.

Capture defaults:

- sample rate `16000`
- chunk size normalized from user option (default input `1024`)
- mono channel + echo/noise/auto-gain constraints

Per capture callback (`AudioWorkletNode`):

1. read Float32 channel data
2. convert to PCM16 via `DesktopVoiceAudioEncodingRuntime.float32ToPcm16`
3. send ArrayBuffer through `wakeword-audio-chunk` IPC channel

Chunk normalization:

- `DesktopVoiceAudioEncodingRuntime.normalizeAudioCaptureChunkSize` chooses nearest supported size
- warning emitted when requested size differs

## Detection Filtering Policy

For each value-level wakeword detection event:

1. receive `model`, finite numeric `confidence`, and optional numeric `score`
   from `DesktopVoiceRuntimeClient.onWakewordDetectedValues(...)`; invalid
   confidence values are rejected before hook policy runs
2. drop event if within cooldown window (`2000ms`)
3. compare confidence to threshold (default `0.5`)
4. on accepted detection:
- update cooldown timestamp
- send immediate `wakeword-disable`
- call user callback with `{ model, confidence, score }`

Immediate disable is a guard against queued/buffered audio retriggering.

## Error and Status Handling

`wakeword-status` updates:

- `isReady` state (with changed-state logging)
- `error` state (non-empty error kept; otherwise cleared)

Missing microphone behavior (`NotFoundError` / "requested device not found"):

- local capture error is surfaced with reconnect guidance
- capture startup enters missing-device lockout to prevent repeated start attempts/log spam while still enabled
- lockout state is persisted across hook remounts to avoid repeated retries when UI surfaces restart while wakeword remains enabled
- lockout state is stored on `globalThis.__desktopRuntimeWakewordCaptureGuard` with:
  - `missingDeviceLocked`
  - `nextRetryAt`
- suppression-only disable (`wakewordActive=false` while `wakewordPreferenceEnabled=true`) does not clear lockout
- lockout clears when:
  - user preference is explicitly disabled (`wakewordPreferenceEnabled=false`)
  - `DesktopVoiceAudioInputDeviceRuntime.onAudioInputDeviceChange(...)`
    receives a browser device-change event and the app-runtime audio-device
    probe reports an available `audioinput`

Audio context close errors are suppressed when message indicates already-closed context; unexpected close errors are warning-logged.

Status/error precedence details:

- `wakeword-status.error` sets hook error while enabled
- `wakeword-status` without error clears error only when `localCaptureErrorRef` is false
- this prevents healthy-status noise from immediately hiding local mic-capture failures

## Drift Hotspots

1. removing immediate disable on detection can cause repeated rapid wakeword callbacks.
2. moving raw `model` / `confidence` / `score` bridge parsing back into
   `useWakewordBridgeEvents` duplicates the voice runtime client boundary.
3. weakening generation guards can leak or resurrect old capture sessions.
4. changing channel names without preload/main parity update breaks wakeword runtime silently.
5. skipping cooldown reset on disable/re-enable can cause instant false retriggers.

## Test-Locked Invariants

`tests/frontend/voice/WakewordDetectionHook.test.ts` validates:

- listener registration and enable/disable send-gating
- value-level detection projection, cooldown behavior, and immediate disable on
  accepted detection
- late `getUserMedia` resolution cleanup after disable
- missing-device lockout persistence across remounts
- suppression-only toggles keep lockout active
- explicit preference disable clears lockout
- `devicechange` unlock retries capture once an audio input exists
- sticky local-capture error behavior under healthy status packets
- idempotent stop cleanup under repeated disable/unmount paths

## Related Pages

- [Frontend Renderer Voice Docs Hub](README.md)
- [Frontend Renderer Voice Utils Docs Hub](utils/README.md)
- [Wakeword Capture Guard Utility Reference](utils/wakeword_capture_guard_global_lockout_and_device_probe_reference.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Frontend Overlay and Wakeword Control Channel Reference](../../contracts/overlay_and_wakeword_control_channel_reference.md)
- [Electron Wakeword Bridge and Audio Framing Reference](../../sidecar/wakeword_bridge_and_audio_framing_reference.md)
