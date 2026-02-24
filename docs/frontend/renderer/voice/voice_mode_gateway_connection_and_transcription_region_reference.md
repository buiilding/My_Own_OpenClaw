---
summary: "Deep reference for renderer voice-mode transcription: Nova-Voice WebSocket lifecycle, PCM16 framing, reconnect backoff, utterance-end auto-submit, and transcription region replacement rules."
read_when:
  - When changing `useVoiceMode` gateway behavior, microphone capture settings, or audio payload framing.
  - When debugging missing realtime transcript updates, silence auto-submit issues, or repeated reconnect failures.
title: "Voice Mode Gateway Connection and Transcription Region Reference"
---

# Voice Mode Gateway Connection and Transcription Region Reference

## Canonical Modules

- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/utils/audioEncoding.ts`
- `frontend/src/renderer/features/voice/utils/audioCaptureCleanup.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/features/chat/utils/transcriptionRegions.ts`

## Activation and Hook Ownership

`MessageInput` owns voice-mode usage:

- calls `useVoiceMode(voiceModeEnabled, onTranscriptionUpdate, onUtteranceEnd)`
- shows `VoiceStatus` only when voice mode is enabled

Submit behavior coupling:

- typed submit path (`Enter` or send button)
- utterance-end callback path (`submitMessageValue(getInputValue())`)

Both paths share `buildOutgoingMessage(...)` and clear/reset transcription region after send.

## Gateway WebSocket Lifecycle

Default endpoint:

- `ws://localhost:5026`

On connect:

- open socket if not already open
- send language payload:
- `{"type":"set_langs","source_language":"en","target_language":"en"}`

Inbound message handling:

- `status`: cache `client_id`
- `realtime`: read `translation` fallback to `text`, forward to transcription callback with `is_final` flag
- `utterance_end`: trigger submit callback, then send `{"type":"start_over"}`

Reconnect policy:

- max 5 attempts
- exponential delay (`1s, 2s, 4s, 8s, 16s`)
- reconnect only while hook remains enabled

## Audio Capture Pipeline

Capture configuration:

- `getUserMedia` mono audio
- requested sample rate `16000`
- echo cancellation + noise suppression enabled

Node graph:

1. `MediaStreamAudioSourceNode`
2. `ScriptProcessorNode` (buffer size `4096`)
3. destination connection to keep processing loop active

Per audio callback:

1. read Float32 mono channel data
2. convert with `float32ToPcm16(...)`
3. frame with `buildGatewayAudioMessage(...)`
4. send binary payload to gateway socket

## Binary Framing Contract

`buildGatewayAudioMessage(...)` format:

1. 4-byte little-endian metadata length
2. JSON metadata bytes (`{"sampleRate": <value>}`)
3. PCM16 audio payload bytes

Optimization:

- metadata prefix cached by sample rate (`metadataPrefixCache`) to avoid repeated JSON/prefix re-encode

## Shared Cleanup Semantics

Shutdown path (`stopAudioCapture` + `disconnectWebSocket`):

- clear reconnect timer
- disconnect script/source nodes
- null `onaudioprocess`
- stop media tracks
- close and null audio context
- close websocket and clear client id/connected state

`takeAudioContext(...)` ensures close happens on a detached reference to prevent duplicate-close races.

## Transcription Region Replacement Rules

`useTranscription` keeps one mutable active region:

- first transcript chunk appends text and opens region
- subsequent chunks replace only that region
- manual typing/paste adjusts region offsets via helper utilities
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
- [Frontend Renderer Voice Utils Docs Hub](utils/README.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)
- [Voice Capture and Wakeword Controller Reference](../voice_capture_and_wakeword_controller_reference.md)
