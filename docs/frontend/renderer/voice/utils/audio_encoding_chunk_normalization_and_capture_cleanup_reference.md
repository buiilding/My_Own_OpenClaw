---
summary: "Deep reference for renderer voice utility primitives: Float32->PCM16 conversion, gateway binary framing cache, chunk-size normalization, browser audio-input adapters, AudioWorklet-only capture processing, removed ScriptProcessor fallback behavior, processorNodeRef cleanup, and safe audio-node/context teardown behavior."
read_when:
  - When changing voice/wakeword audio chunk conversion or gateway framing payload shape.
  - When debugging mic-resource leaks, microphone device-change recovery, repeated AudioContext-close warnings, AudioWorklet capture processor unavailable errors, removed ScriptProcessor fallback behavior, processorNodeRef cleanup, or wakeword chunk-size warnings/normalization behavior.
  - When resolving removed ScriptProcessor fallback voice capture behavior.
title: "Audio Encoding, Chunk Normalization, and Capture Cleanup Reference"
---

# Audio Encoding, Chunk Normalization, and Capture Cleanup Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordEventRuntime.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`

## PCM Conversion Contract

`DesktopVoiceAudioEncodingRuntime.float32ToPcm16(Float32Array)` behavior:

- clamps input sample to `[-1, 1]`
- negative branch scales by `0x8000`
- non-negative branch scales by `0x7fff`
- returns `Int16Array` same length as input

Practical effect:

- avoids overflow distortion for out-of-range floating samples
- keeps signed PCM asymmetry expected by many speech runtimes

## Gateway Binary Framing Contract

`DesktopVoiceAudioEncodingRuntime.buildGatewayAudioMessage(audioData, sampleRate)` output layout:

1. 4-byte little-endian unsigned metadata length
2. UTF-8/ASCII JSON metadata body (`{"sampleRate": ...}`)
3. raw PCM16 bytes from input `Int16Array`

Caching detail:

- metadata prefix bytes are memoized by `sampleRate` (`metadataPrefixCache`)
- repeated chunks at same sample rate avoid repeated JSON serialization and prefix reconstruction

## Capture Chunk Normalization

`DesktopVoiceAudioEncodingRuntime.normalizeAudioCaptureChunkSize(size)` chooses nearest value from:

- `256, 512, 1024, 1280, 2048, 4096, 8192, 16384`

Wakeword hook behavior:

- raw configured chunk size is normalized once per render
- warning emitted when requested size differs from normalized value

The normalized chunk size is passed to the AudioWorklet capture processor so
wakeword framing stays on a supported/stable set while preserving closest user
intent.

## Audio Input Device Adapter Contract

`DesktopVoiceAudioInputDeviceRuntime` owns browser audio-input adapters used by
voice and wakeword hooks:

- `requestAudioInputStream(...)`: wraps `navigator.mediaDevices.getUserMedia`
  and assembles mono sample-rate, echo/noise, and optional auto-gain constraints
- `createAudioInputContext(...)`: wraps `AudioContext` / `webkitAudioContext`
  construction with a configured sample rate
- `hasAvailableAudioInputDevice()`: probes `enumerateDevices()` for an
  `audioinput` device while swallowing browser probe errors
- `onAudioInputDeviceChange(...)`: registers and cleans up browser
  `devicechange` listeners

Design goal:

- keep feature hooks focused on voice/wakeword lifecycle state while the
  renderer app-runtime owns browser audio-device mechanics

## Capture Processor Selection

This is the canonical route for ScriptProcessor fallback voice capture removed.

`DesktopVoiceAudioProcessorNodeRuntime.createAudioCaptureProcessorNode(...)`
behavior:

- requires an `AudioWorkletNode` capture processor (`desktop-runtime-capture-processor`)
- worklet path batches render quanta into configured chunk-size frames before posting to main thread
- rejects with `AudioWorklet capture processor is unavailable` when AudioWorklet APIs are missing
- rejects with `AudioWorklet capture processor failed to initialize: ...` when module setup or node construction fails

Design goal:

- keep renderer voice capture on the modern worklet path only
- fail visibly when the required worklet path is unavailable

## Shared Mutable Refs (`useAudioCaptureRefs`)

`useAudioCaptureRefs()` centralizes mutable holders used by both voice hooks:

- `mediaStreamRef`
- `audioContextRef`
- `sourceNodeRef`
- `processorNodeRef`

Also provides explicit setter helpers to keep assignment patterns consistent.

## Audio Node Cleanup Contract

`DesktopVoiceAudioCaptureCleanupRuntime.cleanupAudioCaptureNodes(...)` always:

- disconnects the AudioWorklet processor node
- nulls `processorNodeRef.current.port.onmessage`
- disconnects source node
- stops all media stream tracks
- nulls all corresponding refs

This function is intentionally synchronous and idempotent across repeated calls.

## AudioContext Teardown Contract

`DesktopVoiceAudioCaptureCleanupRuntime.takeAudioContext(audioContextRef)`:

- returns current context
- atomically nulls ref before close attempt

`DesktopVoiceAudioCaptureCleanupRuntime.closeAudioContextSafely(audioContext, onUnexpectedCloseError)`:

- no-op when context missing or already closed
- attempts `audioContext.close()`
- suppresses known "already closed" error message variants
- forwards only unexpected close errors to callback

Design goal:

- avoid noisy logs and race failures during rapid enable/disable transitions

## Wakeword Utility Guards

`DesktopWakewordEventRuntime` facade methods:

- `resolveConfidence`: accepts finite numeric confidence only
- `isWithinCooldown`: pure cooldown predicate (`now - last < cooldownMs`)
- `getChunkSizeWarning`: deterministic warning string for normalized chunk substitution

These helpers stay private to the runtime module and are exposed through the
facade so hook logic remains declarative without importing standalone raw
normalizers.

## Drift Hotspots

1. changing gateway frame order or endianness breaks backend transcription gateway decode and provider adapters downstream.
2. removing sample-rate prefix cache increases per-chunk allocation pressure.
3. skipping `processorNodeRef.current.port.onmessage = null` during cleanup can keep callbacks firing on stale nodes.
4. treating all AudioContext close errors as fatal can create false-negative error telemetry on normal teardown races.

## Related Pages

- [Frontend Renderer Voice Utils Docs Hub](README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](../wakeword_detection_ipc_capture_and_cooldown_reference.md)
