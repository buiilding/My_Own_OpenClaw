---
summary: "Renderer voice runtime reference for live transcription and wakeword detection: config ownership, audio capture, IPC/event wiring, and auto-send behavior."
read_when:
  - When changing renderer voice capture hooks, wakeword controller behavior, or audio encoding.
  - When debugging missing transcriptions, wakeword retriggers, or readiness drift between renderer and main wakeword bridge.
title: "Voice Capture and Wakeword Controller Reference"
---

# Voice Capture and Wakeword Controller Reference

## Canonical Modules

- `frontend/src/renderer/app/App.jsx`
- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/voice/utils/audioEncoding.ts`
- `frontend/src/renderer/features/voice/utils/audioCaptureCleanup.ts`
- `frontend/src/renderer/features/voice/utils/wakewordEventUtils.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`

## Two Distinct Voice Pipelines

Renderer runs two independent voice paths:

1. live voice transcription (`useVoiceMode`) for message input text
2. passive wakeword detection (`useWakewordDetection`) for "Hey Jarvis" activation

They share microphone primitives but have different transport paths:

- transcription path: renderer -> Nova-Voice gateway WebSocket (`ws://localhost:5026`)
- wakeword path: renderer -> Electron IPC -> main wakeword bridge -> Python wakeword service

## Config Ownership and Activation Gates

`AppConfigProvider` owns activation inputs:

- `config.voice_mode_enabled`: controls `MessageInput` transcription hook enable flag
- `wakewordEnabled`: persisted wakeword preference from settings UI
- `wakewordSuppressed`: temporary runtime suppression from main-process `wakeword-toggle`
- `wakewordActive = wakewordEnabled && !wakewordSuppressed`: input to `WakewordController`

`WakewordController` is always mounted under `App`, but the hook is inert when `wakewordActive` is false.

## Live Transcription Flow (`useVoiceMode`)

`MessageInput` wires `useVoiceMode(voiceModeEnabled, onTranscriptionUpdate, onUtteranceEnd)`:

- `onTranscriptionUpdate(text)`: updates transcription region via `useTranscription`
- `onUtteranceEnd()`: submits current input value immediately (auto-send on silence)

Hook lifecycle:

1. enable -> open gateway WebSocket
2. `onopen` -> send `{"type":"set_langs","source_language":"en","target_language":"en"}`
3. `status` message -> store `client_id`
4. `realtime` message -> use `translation` or `text`, push to transcription callback
5. `utterance_end` message -> call submit callback and send `{"type":"start_over"}`
6. disable/unmount -> stop audio capture + close socket + clear reconnect timers

Reconnect policy:

- exponential backoff (`1s, 2s, 4s, ...`) with max 5 attempts
- reconnect only if hook still enabled

## Voice Audio Capture and Encoding

`useVoiceMode.startAudioCapture()` setup:

- `getUserMedia` with mono/16kHz + echo/noise controls
- `AudioContext` at 16kHz
- `ScriptProcessorNode` buffer size 4096
- every `onaudioprocess`:
- read Float32 input
- convert to PCM16 (`float32ToPcm16`)
- frame payload (`buildGatewayAudioMessage`)
- send binary payload over WebSocket

Gateway binary framing (`buildGatewayAudioMessage`):

- prefix: 4-byte little-endian metadata length
- metadata body: JSON bytes (`{"sampleRate":16000}`)
- payload body: PCM16 bytes

Cleanup path uses shared helpers:

- disconnect script/source nodes
- null `onaudioprocess`
- stop media tracks
- close AudioContext

## Transcription Region Behavior

`useTranscription` keeps a tracked insertion range:

- first transcription chunk appends and marks region
- subsequent chunks replace same region (avoids repeated duplication)
- manual typing/paste updates region offsets
- send/reset clears region so next utterance starts fresh

This is why partial real-time updates can overwrite earlier draft text but preserve user edits outside region boundaries.

## Wakeword Flow (`useWakewordDetection`)

`WakewordController` callback on detection:

1. `ApiClient.wakewordDetected()` -> send backend `wakeword-detected` message
2. `IpcBridge.invoke('show-chatbox')` -> reveal chat UI

Hook startup:

1. subscribe `wakeword-detected` + `wakeword-status`
2. send `wakeword-enable` to request service activation/status
3. start microphone capture only when `enabled && isReady`

Wakeword capture path:

- convert mic frames Float32 -> PCM16
- send ArrayBuffer via `SEND_CHANNELS.WAKEWORD_AUDIO_CHUNK`
- main process handles service transport details

Detection guardrails:

- confidence validated with `resolveConfidence`
- 2-second cooldown prevents rapid retrigger loops
- threshold compare (`default 0.5`)
- on accepted detection: send `wakeword-disable` immediately before callback

Chunk-size normalization:

- requested ScriptProcessor size is normalized to nearest supported power-of-two-like value set
- warning logged when normalized value differs

## Failure and Drift Hotspots

- repeated wakeword triggers:
- check cooldown timer updates
- verify immediate `wakeword-disable` send path
- missing transcriptions:
- verify gateway WebSocket open state and `isRecording` transition
- verify `voice_mode_enabled` true in renderer config
- no wakeword readiness:
- inspect `wakeword-status` events reaching renderer
- verify `wakeword-toggle` suppression is not forcing inactive state
- stuck microphone:
- check cleanup path ran (`stopAudioCapture`) and tracks were stopped

## Cross-Doc References

- Wakeword bridge internals: `docs/frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md`
- Main-process query relay impacts after wakeword activation: `docs/frontend/main/query_payload_and_relay_reference.md`
