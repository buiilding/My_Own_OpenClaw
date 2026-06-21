---
summary: "Deep reference for renderer PlayerService internals: PCM decode pipeline, sequential queue playback contract, playback-generation stale callback isolation, and stop/cleanup error-recovery semantics."
read_when:
  - When changing audio chunk enqueue/decode/playback behavior in `PlayerService`.
  - When debugging stale `onended` callbacks, queue continuation after stop, or audio-context cleanup failures.
title: "Player Service Queue, Generation, and Error-Recovery Reference"
---

# Player Service Queue, Generation, and Error-Recovery Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `tests/frontend/PlayerService.test.ts`

## Runtime Boundary

`PlayerService` is a renderer-only infrastructure primitive:

- no React dependencies
- no IPC knowledge
- receives normalized audio chunks `{audio, sample_rate}` from caller

Caller wiring:

1. `ChatInterface` subscribes through `DesktopAudioRuntimeClient.onAudioChunk(...)`
2. the audio runtime client privately filters/normalizes `audio-chunk` events
3. `audioPlayerRef.current.enqueueAudio(chunk)` passes data to PlayerService

## Queue and Playback Contract

Core state:

- `audioQueue` FIFO chunk buffer
- `isPlaying` playback flag
- `activeSource` currently playing source node
- `audioContext` lazy-initialized WebAudio context
- `playbackGeneration` stale-callback guard counter

`enqueueAudio(chunk)` behavior:

- always appends to FIFO queue
- if idle (`!isPlaying`), immediately starts `playNext()`
- if already playing, chunk waits in queue

Sequential playback rule:

- one source at a time
- each source `onended` triggers `playNext()` for next queued chunk
- when queue empty, `isPlaying=false` and `activeSource=null`

## Decode and Buffering Pipeline

Per chunk decode path in `playNext()`:

1. base64 decode -> bytes (`base64ToArrayBuffer`)
2. bytes interpreted as little-endian PCM16 (`Int16Array`)
3. PCM16 converted to WebAudio float samples (`Float32Array`, divide by `32768.0`)
4. mono `AudioBuffer` allocated with provided sample rate
5. source created, connected to `ctx.destination`, started at `0`

Context behavior:

- `getAudioContext()` lazily creates `AudioContext` (or webkit fallback)
- if context state is `suspended`, it attempts async `resume()`
- resume failures are swallowed; playback attempt still proceeds

## Playback Generation Guard

`playbackGeneration` prevents stale callbacks from old playback epochs.

`playNext()` snapshots current generation per source:

- `const playbackGeneration = this.playbackGeneration`

In `source.onended`:

- if current generation no longer matches snapshot, callback returns early
- no new playback starts from stale source completion

`stopPlayback()` increments generation before teardown.

Result:

- stale `onended` callbacks from pre-stop sources cannot resume queue playback

## Stop and Cleanup Semantics

`stopPlayback()` behavior:

1. increment generation
2. clear queue
3. set `isPlaying=false`
4. detach/stop/disconnect active source (best effort; errors swallowed)
5. close and null audio context (close rejection swallowed)

`cleanup()` delegates to `stopPlayback()`.

Intent:

- hard reset to known idle state even when node/context calls throw
- avoid overlap between old and next query audio

## Error-Recovery Contract

Inside `playNext()`:

- decode/start path wrapped in try/catch
- on failure, logs error and immediately attempts next queued chunk
- if a source was partially created and matches `activeSource`, active pointer is cleared

Implication:

- one bad chunk should not deadlock later queued audio chunks

## `isPlaying` Semantics

`getIsPlaying()` exposes current local flag:

- true after `playNext()` starts a source
- false when queue drains empty or on stop/reset

It is a service-local indicator, not a global backend stream phase signal.

## Test-Backed Invariants

`tests/frontend/PlayerService.test.ts` validates:

- first enqueue starts immediate playback
- queued chunks play sequentially after `onended`
- stop prevents stale `onended` continuation
- stale stored `onended` callbacks are ignored after generation change
- cleanup closes audio context
- suspended-context resume rejection does not crash playback start
- queue drain sets player back to idle
- source stop/disconnect and context close errors are swallowed
- start failure on first chunk logs error and continues to next queued chunk

## Drift Hotspots

1. Removing generation checks can reintroduce post-stop ghost playback from stale callbacks.
2. Changing stop order (for example incrementing generation late) can create race windows.
3. Changing PCM normalization or channel assumptions can distort output audio.
4. Throwing from cleanup paths can leave chat stop/new-query actions partially reset.

## Related Pages

- [Frontend Renderer Infrastructure Audio Docs Hub](README.md)
- [Audio Chunk Playback and Stop Semantics Reference](../../../runtime/audio_chunk_playback_and_stop_semantics_reference.md)
- [Electron Wakeword Bridge and Audio Framing Reference](../../../sidecar/wakeword_bridge_and_audio_framing_reference.md)
