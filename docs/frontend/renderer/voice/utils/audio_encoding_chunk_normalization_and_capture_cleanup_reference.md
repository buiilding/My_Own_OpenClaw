---
summary: "Deep reference for renderer voice utility primitives: Float32->PCM16 conversion, gateway binary framing cache, chunk-size normalization, AudioWorklet/script fallback capture processing, and safe audio-node/context teardown behavior."
read_when:
  - When changing voice/wakeword audio chunk conversion or gateway framing payload shape.
  - When debugging mic-resource leaks, repeated AudioContext-close warnings, or wakeword chunk-size warnings/normalization behavior.
title: "Audio Encoding, Chunk Normalization, and Capture Cleanup Reference"
---

# Audio Encoding, Chunk Normalization, and Capture Cleanup Reference

## Canonical Modules

- `frontend/src/renderer/features/voice/utils/audioEncoding.ts`
- `frontend/src/renderer/features/voice/utils/audioCaptureCleanup.ts`
- `frontend/src/renderer/features/voice/utils/audioProcessorNode.ts`
- `frontend/src/renderer/features/voice/utils/wakewordEventUtils.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`

## PCM Conversion Contract

`float32ToPcm16(Float32Array)` behavior:

- clamps input sample to `[-1, 1]`
- negative branch scales by `0x8000`
- non-negative branch scales by `0x7fff`
- returns `Int16Array` same length as input

Practical effect:

- avoids overflow distortion for out-of-range floating samples
- keeps signed PCM asymmetry expected by many speech runtimes

## Gateway Binary Framing Contract

`buildGatewayAudioMessage(audioData, sampleRate)` output layout:

1. 4-byte little-endian unsigned metadata length
2. UTF-8/ASCII JSON metadata body (`{"sampleRate": ...}`)
3. raw PCM16 bytes from input `Int16Array`

Caching detail:

- metadata prefix bytes are memoized by `sampleRate` (`metadataPrefixCache`)
- repeated chunks at same sample rate avoid repeated JSON serialization and prefix reconstruction

## Script-Processor Chunk Normalization

`normalizeScriptProcessorChunkSize(size)` chooses nearest value from:

- `256, 512, 1024, 1280, 2048, 4096, 8192, 16384`

Wakeword hook behavior:

- raw configured chunk size is normalized once per render
- warning emitted when requested size differs from normalized value

This keeps ScriptProcessor setup on a supported/stable set while preserving closest user intent.

## Capture Processor Selection

`createAudioCaptureProcessorNode(...)` behavior:

- prefers `AudioWorkletNode` capture processor (`windieos-capture-processor`) when available
- worklet path batches render quanta into configured chunk-size frames before posting to main thread
- falls back to legacy `createScriptProcessor(...)` callback path when worklet module init is unavailable/fails

Design goal:

- keep modern browser audio path as default
- preserve backwards compatibility on runtimes where worklets are unavailable

## Shared Mutable Refs (`useAudioCaptureRefs`)

`useAudioCaptureRefs()` centralizes mutable holders used by both voice hooks:

- `mediaStreamRef`
- `audioContextRef`
- `sourceNodeRef`
- `scriptNodeRef`

Also provides explicit setter helpers to keep assignment patterns consistent.

## Audio Node Cleanup Contract

`cleanupAudioCaptureNodes(...)` always:

- disconnects script node
- nulls `onaudioprocess`
- disconnects source node
- stops all media stream tracks
- nulls all corresponding refs

This function is intentionally synchronous and idempotent across repeated calls.

## AudioContext Teardown Contract

`takeAudioContext(audioContextRef)`:

- returns current context
- atomically nulls ref before close attempt

`closeAudioContextSafely(audioContext, onUnexpectedCloseError)`:

- no-op when context missing or already closed
- attempts `audioContext.close()`
- suppresses known "already closed" error message variants
- forwards only unexpected close errors to callback

Design goal:

- avoid noisy logs and race failures during rapid enable/disable transitions

## Wakeword Utility Guards

`wakewordEventUtils` helpers:

- `resolveConfidence`: accepts finite numeric confidence only
- `isWithinCooldown`: pure cooldown predicate (`now - last < cooldownMs`)
- `getChunkSizeWarning`: deterministic warning string for normalized chunk substitution

These helpers keep hook logic declarative and testable.

## Drift Hotspots

1. changing gateway frame order or endianness breaks backend transcription gateway decode and provider adapters downstream.
2. removing sample-rate prefix cache increases per-chunk allocation pressure.
3. skipping `onaudioprocess = null` during cleanup can keep callbacks firing on stale nodes.
4. treating all AudioContext close errors as fatal can create false-negative error telemetry on normal teardown races.

## Related Pages

- [Frontend Renderer Voice Utils Docs Hub](README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](../wakeword_detection_ipc_capture_and_cooldown_reference.md)
