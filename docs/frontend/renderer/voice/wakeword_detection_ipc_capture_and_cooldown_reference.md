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
- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/features/voice/utils/wakewordEventUtils.ts`
- `frontend/src/renderer/features/voice/utils/audioEncoding.ts`
- `frontend/src/renderer/features/voice/utils/audioCaptureCleanup.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`

## Activation Gate

`WakewordController` feeds `wakewordActive` from app config into `useWakewordDetection(...)`.

`wakewordActive` is computed in `AppConfigProvider`:

- `wakewordEnabled` (user preference)
- `wakewordSuppressed` (runtime suppression from `wakeword-toggle` channel)
- `wakewordActive = wakewordEnabled && !wakewordSuppressed`

Detection callback behavior:

1. send backend `wakeword-detected` signal via `ApiClient`
2. invoke `show-chatbox` through IPC

## IPC Channel Contract

Renderer send channels used:

- `wakeword-enable`
- `wakeword-disable`
- `wakeword-audio-chunk`

Renderer subscribe channels used:

- `wakeword-detected`
- `wakeword-status`

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

## Generation Guard Against Async Races

`captureGenerationRef` increments on start/stop transitions.

`startAudioCapture` captures the current generation and aborts setup when generation changes mid-await:

- stops just-opened tracks
- closes just-opened audio context safely

This prevents stale async setup from reviving capture after a stop request.

## Audio Capture and Transport

Capture defaults:

- sample rate `16000`
- chunk size normalized from user option (default input `1024`)
- mono channel + echo/noise/auto-gain constraints

Per script processor callback:

1. read Float32 channel data
2. convert to PCM16 via `float32ToPcm16`
3. send ArrayBuffer through `wakeword-audio-chunk` IPC channel

Chunk normalization:

- `normalizeScriptProcessorChunkSize` chooses nearest supported size
- warning emitted when requested size differs

## Detection Filtering Policy

For each `wakeword-detected` event:

1. parse confidence with `resolveConfidence`; reject invalid values
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

Audio context close errors are suppressed when message indicates already-closed context; unexpected close errors are warning-logged.

## Drift Hotspots

1. removing immediate disable on detection can cause repeated rapid wakeword callbacks.
2. weakening generation guards can leak or resurrect old capture sessions.
3. changing channel names without preload/main parity update breaks wakeword runtime silently.
4. skipping cooldown reset on disable/re-enable can cause instant false retriggers.

## Related Pages

- [Frontend Renderer Voice Docs Hub](README.md)
- [Frontend Renderer Voice Utils Docs Hub](utils/README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Frontend Overlay and Wakeword Control Channel Reference](../../contracts/overlay_and_wakeword_control_channel_reference.md)
- [Frontend Sidecar Wakeword Bridge and Audio Framing Reference](../../sidecar/wakeword_bridge_and_audio_framing_reference.md)
