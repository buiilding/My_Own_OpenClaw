---
summary: "Deep reference for renderer voice-mode transcription: desktop transcription gateway lifecycle, PCM16 framing, reconnect backoff, utterance-end session reset, and transcription region replacement rules."
read_when:
  - When changing `useVoiceMode` gateway behavior, microphone capture settings, or audio payload framing.
  - When debugging missing realtime transcript updates, utterance-end session reset issues, or repeated reconnect failures.
title: "Voice Mode Gateway Connection and Transcription Region Reference"
---

# Voice Mode Gateway Connection and Transcription Region Reference

## Canonical Modules

- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts`

## Activation and Hook Ownership

`MessageInput` owns voice-mode usage:

- starts `useVoiceMode(...)` from a local microphone-session toggle instead of persisted config
- shows `VoiceStatus` while the temporary microphone session is active or when the session reports an error

Submit behavior coupling:

- typed submit path (`Enter` or send button)
- microphone utterance-end callback path (stop dictation session, keep transcript in input)

Send paths still share `buildOutgoingMessage(...)` and clear/reset transcription region after send.

## Gateway WebSocket Lifecycle

Default endpoint:

- derived from the active backend HTTP endpoint
- backend path is `/ws/transcription`
- example local fallback: `ws://127.0.0.1:8765/ws/transcription`

On connect:

- `DesktopVoiceRuntimeClient.isTranscriptionWebSocketActive(...)` gates opening
  a new socket when a current socket is connecting, open, or closing
- send language payload:
- `{"type":"set_langs","source_language":"en","target_language":"en"}`

Inbound message handling:

- `DesktopVoiceRuntimeClient.dispatchTranscriptionGatewayMessage(...)` owns
  gateway message classification and raw field extraction
- `status`: runtime client emits a client-id value for the hook to cache
- `realtime`: runtime client emits `(text, isFinal)` values using the
  `translation` fallback to `text`
- `utterance_end`: runtime client emits an utterance-end callback; the hook
  triggers the caller-owned session-end callback, then asks
  `DesktopVoiceRuntimeClient.sendTranscriptionStartOverIfOpen(...)` to send
  `{"type":"start_over"}` only when the socket is open
- `trace_event` and unknown message diagnostics are routed through value-level
  callbacks so the hook does not switch on gateway protocol fields

Runtime/provider boundary:

- renderer speaks through the voice app-runtime client and the desktop
  transcription gateway protocol only
- backend owns provider selection, provider-specific session setup, and gateway
  translation behind `/ws/transcription`
- renderer-facing code treats provider/model config as backend-owned route
  behavior, not hook or runtime state

Reconnect policy:

- max 5 attempts
- exponential delay (`1s, 2s, 4s, 8s, 16s`)
- reconnect only while hook remains enabled
- reconnect timer scheduling, replacement, missing-adapter fallback, and cleanup
  route through
  `DesktopVoiceRuntimeClient.scheduleTranscriptionReconnectTimer(...)` and
  `clearTranscriptionReconnectTimer(...)`; the hook owns enabled state,
  attempt count, and reconnect callbacks

## Audio Capture Pipeline

Capture configuration:

- `DesktopVoiceAudioInputDeviceRuntime.requestAudioInputStream(...)` owns the
  browser `getUserMedia` call for mono audio
- `DesktopVoiceAudioInputDeviceRuntime.createAudioInputContext(...)` owns
  browser `AudioContext` construction
- requested sample rate `16000`
- echo cancellation + noise suppression enabled
- capture startup uses a generation guard; disabling voice mode or unmounting
  while `getUserMedia` or processor creation is pending invalidates that start
  attempt and stops any stream acquired by the stale attempt

Node graph:

1. `MediaStreamAudioSourceNode`
2. `AudioWorkletNode` capture processor (`desktop-runtime-capture-processor`)
3. destination connection to keep processing loop active

Per audio callback:

1. read Float32 mono channel data
2. convert with `DesktopVoiceAudioEncodingRuntime.float32ToPcm16(...)`
3. frame with `DesktopVoiceAudioEncodingRuntime.buildGatewayAudioMessage(...)`
4. send binary payload through
   `DesktopVoiceRuntimeClient.sendTranscriptionAudioMessageIfOpen(...)`

## Binary Framing Contract

`DesktopVoiceAudioEncodingRuntime.buildGatewayAudioMessage(...)` format:

1. 4-byte little-endian metadata length
2. JSON metadata bytes (`{"sampleRate": <value>}`)
3. PCM16 audio payload bytes

Optimization:

- metadata prefix cached by sample rate (`metadataPrefixCache`) to avoid repeated JSON/prefix re-encode

## Shared Cleanup Semantics

Shutdown path (`stopAudioCapture` + `disconnectWebSocket`):

- invalidate any pending capture start before it can mark recording active
- clear reconnect timer through `DesktopVoiceRuntimeClient`
- disconnect processor/source nodes
- null `AudioWorkletNode.port.onmessage`
- stop media tracks
- close and null audio context
- close websocket through `DesktopVoiceRuntimeClient.closeTranscriptionWebSocket(...)`
  and clear client id/connected state
- audio capture ref setter callbacks are stable across renders so normal voice
  status updates do not rebuild capture callbacks or encourage duplicate socket
  connection attempts

`DesktopVoiceAudioCaptureCleanupRuntime.takeAudioContext(...)` ensures close
happens on a detached reference to prevent duplicate-close races.

## Transcription Region Replacement Rules

`useTranscription` keeps one mutable active region:

- first transcript chunk appends text and opens region
- subsequent chunks replace only that region
- manual typing/paste adjusts region offsets via helper utilities
- pasted-text extraction from `ClipboardEvent.clipboardData` routes through
  `DesktopTranscriptionRegionRuntime.readTextFromPasteEvent(...)`
- reset clears region after message send

Effect:

- live transcript can evolve without repeatedly appending duplicate fragments
- user edits outside the active transcription region are preserved

## Drift Hotspots

1. changing gateway payload framing can silently break backend transcription decode.
2. removing reconnect guards can create runaway socket loops when gateway is unavailable.
3. bypassing transcription region tracking causes transcript duplication or cursor jumps.
4. skipping unified shutdown can leak tracks, processors, or dangling open sockets.

## Related Pages

- [Frontend Renderer Voice Docs Hub](README.md)
- [Renderer Voice Components Docs Hub](components/README.md)
- [Voice Status Error, Recording, and Connection Indicator Contract Reference](components/voice_status_error_recording_and_connection_indicator_contract_reference.md)
- [Frontend Renderer Voice Utils Docs Hub](utils/README.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)
- [Voice Capture and Wakeword Controller Reference](../voice_capture_and_wakeword_controller_reference.md)
