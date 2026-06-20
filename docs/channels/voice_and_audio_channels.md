---
summary: "Voice and audio channel guide covering wakeword, voice dictation, transcription stream websocket, TTS audio chunks, and debugging ownership."
read_when:
  - When changing voice mode, wakeword capture, STT gateway behavior, TTS playback, or audio event routing.
  - When debugging microphone capture, transcription stream websocket failures, wakeword subprocess behavior, or audio-chunk playback.
  - When routing transcription stream ownership between renderer voice capture, the desktop voice gateway, and backend STT providers.
title: "Voice, Audio, and Transcription Stream Channels"
---

# Voice, Audio, and Transcription Stream Channels

WindieOS voice is three channels that share microphone/audio concepts but have different owners.

## Channel Split

| Channel | Purpose | Transport | Owners |
| --- | --- | --- | --- |
| Wakeword | Ambient trigger detection | renderer audio chunks -> Electron main IPC -> local-runtime wakeword helper backed by the Python wakeword subprocess | `WakewordController.jsx`, `wakeword_bridge*.cjs`, `wakeword_service.py` |
| Voice dictation | Turn text entry from microphone | renderer audio -> backend `/ws/transcription` | voice hooks, renderer app-runtime voice audio helpers, transcription route/services |
| TTS playback | Spoken backend response | backend `/ws` `audio-chunk` events -> renderer playback queue | backend TTS manager/session, renderer audio service |

Do not route live dictation through the wakeword subprocess. Do not route wakeword chunks to `/ws/transcription`. Do not treat TTS `audio-chunk` events as transcription responses.

## Wakeword Channel

Main flow:

1. renderer `WakewordController` starts only when config and surface state allow it.
2. renderer captures microphone chunks.
3. chunks are sent over IPC channel `wakeword-audio-chunk`.
4. Electron main forwards normalized binary frames to the local-runtime wakeword helper backed by the Python wakeword service.
5. the wakeword subprocess emits detection results.
6. Electron main sends renderer events such as `wakeword-detected` and `wakeword-status`.
7. optional backend activation uses the normal `/ws` `wakeword-detected` message path.

Key files:

- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/features/voice/**`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/python/wakeword_service.py`
- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/api/services/wakeword_execution.py`

Read next:

- [Voice Audio Change Workflow](voice_audio_change_workflow.md)
- [Voice and Wakeword](../desktop/voice_and_wakeword.md)
- [Electron Wakeword Bridge and Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](../frontend/sidecar/services/wakeword_service_model_bootstrap_and_binary_framing_reference.md)

## Voice Dictation Channel

This is the canonical transcription stream route for live dictation.

Main flow:

1. renderer voice hooks capture and frame audio.
2. the client opens backend `GET /ws/transcription`.
3. backend immediately emits a `status` message with a client id.
4. text control messages configure language/start-over behavior.
5. binary audio frames are parsed by the gateway.
6. backend provider sessions normalize STT provider events into one renderer protocol.
7. renderer updates the active transcription region/composer text.

Key files:

- `frontend/src/renderer/features/voice/hooks/*`
- `frontend/src/renderer/app/runtime/desktopVoiceAudio*Runtime.ts`
- `frontend/src/renderer/app/runtime/desktopWakeword*Runtime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- `backend/src/api/routes/transcription/router.py`
- `backend/src/api/services/transcription/*`

Provider notes:

- OpenAI realtime transcription uses provider websocket sessions behind the backend route.
- OpenAI realtime connect closes and clears the provider websocket if the initial
  `session.update` fails, so failed setup does not leave a half-initialized
  connection attached to the session.
- OpenAI partial transcripts are scoped by provider item id and are cleared on
  both completed and failed item events.
- Nova and OpenAI modes should preserve the same renderer-facing event protocol.
- invalid control JSON/audio frames are ignored with warnings instead of taking down the route.

Read next:

- [HTTP and WebSocket Endpoint Reference](../backend/api/http_and_ws_endpoint_reference.md)
- [Frontend Voice Mode Gateway and Transcription Region Reference](../frontend/renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Frontend Audio Encoding and Capture Cleanup Reference](../frontend/renderer/voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)

## TTS Playback Channel

Main flow:

1. backend query processing decides whether speech/TTS is enabled.
2. backend TTS manager turns streamed text into audio chunks.
3. chunks are emitted over the main `/ws` channel as `audio-chunk` events.
4. Electron main relays them to renderer on the typed `audio-chunk` side-channel.
5. `DesktopAudioRuntimeClient` validates the payload and renderer audio playback
   services queue/decode/play chunks.
6. stop/new-query cleanup resets pending audio as needed.

Key files:

- `backend/src/api/processing/tts/*`
- `backend/src/api/services/tts_session.py`
- `frontend/src/main/ipc.cjs`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `frontend/src/renderer/features/voice/**`
- `frontend/src/renderer/infrastructure` audio playback helpers

Read next:

- [Backend TTS Manager Audio Stream and Cleanup Reference](../backend/api/processing/tts/tts_manager_audio_stream_and_cleanup_reference.md)
- [Backend TTS Processor Suppression State Machine](../backend/api/processing/tts/tts_processor_suppression_state_machine_reference.md)
- [Frontend Audio Chunk Playback Runtime](../frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md)

## Validation

Wakeword changes:

- renderer wakeword controller tests
- main-process wakeword bridge tests
- local-runtime wakeword helper and Python wakeword service framing tests

Dictation changes:

- voice gateway hook/utility tests
- backend transcription route/service tests
- provider-normalization tests for changed STT providers

TTS changes:

- backend TTS manager/session tests
- renderer audio playback cleanup tests
- stream event tests if `audio-chunk` payloads change

Also run `<windie> docs list` after docs updates.
