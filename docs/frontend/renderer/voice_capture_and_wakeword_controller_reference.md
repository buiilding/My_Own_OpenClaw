---
summary: "Renderer voice runtime reference for live transcription and wakeword detection: config ownership, audio capture, IPC/event wiring, and temporary dictation-session behavior."
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
- `frontend/src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/voice/utils/audioEncoding.ts`
- `frontend/src/renderer/features/voice/utils/audioCaptureCleanup.ts`
- `frontend/src/renderer/features/voice/utils/wakewordEventUtils.ts`
- `frontend/src/renderer/features/voice/utils/wakewordCaptureGuard.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `tests/frontend/voice/WakewordDetectionHook.test.ts`

## Two Distinct Voice Pipelines

Renderer runs two independent voice paths:

1. live voice transcription (`useVoiceMode`) for temporary composer dictation sessions
2. passive wakeword detection (`useWakewordDetection`) for "Hey Jarvis" activation

They share microphone primitives but have different transport paths:

- transcription path: renderer -> WindieOS backend transcription WebSocket (`<backend>/ws/transcription`)
- wakeword path: renderer -> Electron IPC -> main wakeword bridge -> Python wakeword service

Backend ownership detail:

- renderer never chooses the live STT provider
- backend route `/ws/transcription` owns the app-facing protocol
- backend config selects `stt_provider="nova"` (proxy to external Nova-Voice) or `stt_provider="openai"` (translate to OpenAI Realtime)
- when `stt_provider="openai"`, backend connects with `openai_realtime_session_model` and sends `openai_realtime_transcription_model` in `session.update`

## Config Ownership and Activation Gates

`AppConfigProvider` owns activation inputs:

- `wakewordEnabled`: persisted wakeword preference from settings UI
- `wakewordSuppressed`: temporary runtime suppression from main-process `wakeword-toggle`
  - seeded from renderer surface on startup: main dashboard starts unsuppressed, overlay views start suppressed
- `wakewordActive = wakewordEnabled && !wakewordSuppressed`: input to `WakewordController`

`WakewordController` only mounts on dashboard startup surfaces.
The onboarding surface does not mount it, which prevents wakeword startup from
requesting microphone capture before first-run permission onboarding reaches the
microphone step. When mounted, it still passes `wakewordEnabled` separately so
the capture hook can distinguish temporary suppression from explicit user
disable when handling missing-device lockout.

## Live Transcription Flow (`useVoiceMode`)

Dashboard composer:

- `MessageInput` starts `useVoiceMode(...)` only while its local microphone session state is true
- clicking the mic button starts or stops that local session
- utterance end stops the session but leaves transcript text in the composer for manual send/edit

Wakeword chat pill:

- `ChatBox` starts `useVoiceMode(...)` only for a wakeword-triggered follow-up dictation session
- final/utterance-end messages stop that temporary session without auto-submit

Shared callbacks:

- `onTranscriptionUpdate(text)`: updates transcription region via `useTranscription`
- `onUtteranceEnd()`: ends the temporary session

Hook lifecycle:

1. enable -> open gateway WebSocket
2. `onopen` -> send `{"type":"set_langs","source_language":"en","target_language":"en"}`
3. `status` message -> store `client_id`
4. `realtime` message -> use `translation` or `text`, push to transcription callback
5. `utterance_end` message -> call the session-end callback and send `{"type":"start_over"}`
6. disable/unmount -> stop audio capture + close socket + clear reconnect timers

Gateway endpoint resolution:

- default URL is derived from the active backend HTTP endpoint
- path is fixed to `/ws/transcription`
- renderer contract stays the same even when backend swaps providers behind that route

Reconnect policy:

- exponential backoff (`1s, 2s, 4s, ...`) with max 5 attempts
- reconnect only if hook still enabled

## Voice Audio Capture and Encoding

`useVoiceMode.startAudioCapture()` setup:

- `getUserMedia` with mono/16kHz + echo/noise controls
- `AudioContext` at 16kHz
- `AudioWorkletNode` capture processor when available (fallback: `ScriptProcessorNode` buffer size 4096)
- every capture callback:
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

1. `useWakewordBridgeEvents` subscribes `wakeword-detected` + `wakeword-status`
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

Missing-device guardrails:

- capture startup retry uses `CAPTURE_RETRY_DELAY_MS = 3000`
- missing-mic failures lock capture via `globalThis.__windieWakewordCaptureGuard`
- lock persists across hook remounts
- temporary suppression (`wakewordActive=false` while `wakewordEnabled=true`) keeps lockout active
- lockout clears when wakeword preference is explicitly disabled or when `devicechange` detects an available `audioinput`
- local capture errors remain sticky across healthy status packets (`localCaptureErrorRef` gate)

## Failure and Drift Hotspots

- repeated wakeword triggers:
- check cooldown timer updates
- verify immediate `wakeword-disable` send path
- missing transcriptions:
- verify gateway WebSocket open state and `isRecording` transition
- verify an active dictation session or wakeword-triggered STT session is running in the renderer
- no wakeword readiness:
- inspect `wakeword-status` events reaching renderer
- verify `wakeword-toggle` suppression is not forcing inactive state
- stuck microphone:
- check cleanup path ran (`stopAudioCapture`) and tracks were stopped

## Cross-Doc References

- Renderer voice deep-dive hub: `docs/frontend/renderer/voice/README.md`
- Renderer voice utils hub: `docs/frontend/renderer/voice/utils/README.md`
- Voice gateway/transcription-region internals: `docs/frontend/renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md`
- Wakeword IPC/cooldown internals: `docs/frontend/renderer/voice/wakeword_detection_ipc_capture_and_cooldown_reference.md`
- Wakeword capture guard utility internals: `docs/frontend/renderer/voice/utils/wakeword_capture_guard_global_lockout_and_device_probe_reference.md`
- Audio encoding/chunk/cleanup utility internals: `docs/frontend/renderer/voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md`
- Transcription-region state-machine internals: `docs/frontend/renderer/voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md`
- Wakeword bridge internals: `docs/frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md`
- Main-process query relay impacts after wakeword activation: `docs/frontend/main/query_payload_and_relay_reference.md`
