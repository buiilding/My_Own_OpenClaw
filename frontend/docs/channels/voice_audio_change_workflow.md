---
summary: "Workflow for WindieOS voice and audio changes across wakeword capture, microphone permissions, transcription websocket, backend STT providers, TTS chunking, and renderer playback."
read_when:
  - When changing wakeword detection, voice dictation, microphone capture, transcription websocket behavior, STT provider normalization, TTS generation, audio-chunk events, or renderer playback.
  - When debugging microphone permission failures, wakeword subprocess issues, transcription disconnects, missing dictated text, overlapping speech, or dropped audio chunks.
  - When deciding whether a voice/audio bug belongs in renderer capture, Electron wakeword bridge, local-runtime wakeword helper, backend transcription, backend TTS, or renderer playback.
title: "Voice Audio Change Workflow"
---

# Voice Audio Change Workflow

Use this workflow before changing voice or audio behavior. WindieOS has three different audio paths that must stay separate:

- Wakeword detection: renderer microphone chunks -> Electron main -> local-runtime wakeword helper backed by the local-runtime Python wakeword service.
- Voice dictation: renderer microphone chunks -> backend `/ws/transcription` websocket -> renderer text region.
- TTS playback: backend `/ws` `audio-chunk` events -> renderer playback queue.

Do not route live dictation through wakeword. Do not route wakeword chunks to transcription. Do not treat TTS audio chunks as transcription responses.

## Fast Owner Map

| Symptom or request | First owner | Source roots | Start docs | Tests |
| --- | --- | --- | --- | --- |
| microphone permission or onboarding voice gate is wrong | Electron permission service and renderer permission UI | `frontend/src/main/permissions/permission_service_microphone.cjs`, `frontend/src/renderer/features/permissions`, `frontend/src/renderer/features/onboarding` | [Onboarding and Permissions](../desktop/onboarding_permissions.md), [Platform Permission Matrix](../platforms/permission_matrix.md) | `tests/frontend/PermissionService.test.cjs`, permission/onboarding tests |
| wakeword starts during onboarding or when disabled | renderer wakeword controller and settings gate | `frontend/src/renderer/app/WakewordController.jsx`, `frontend/src/renderer/features/voice/hooks`, `frontend/src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts` | [Renderer Voice Capture and Wakeword Controller Reference](../frontend/renderer/voice_capture_and_wakeword_controller_reference.md) | `tests/frontend/voice/WakewordDetectionHook.test.ts`, `tests/frontend/VoiceModeHook.test.ts` |
| wakeword chunks do not reach the local-runtime wakeword helper | Electron wakeword bridge | `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`, `frontend/src/main/wakeword/wakeword_supervisor.cjs` | [Electron Wakeword Bridge and Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md) | `tests/frontend/WakewordBridge.test.cjs`, `tests/frontend/WakewordBridgeRuntime.test.cjs`, `tests/frontend/WakewordSupervisor.test.cjs` |
| wakeword model fails to load or detection output is malformed | Local-runtime wakeword helper backed by the local-runtime Python wakeword service | `frontend/src/main/python/wakeword_service.py` | [Wakeword Service Model Bootstrap and Binary Framing Reference](../frontend/sidecar/services/wakeword_service_model_bootstrap_and_binary_framing_reference.md) | `tests/sidecar/test_wakeword_service.py` |
| voice dictation connects but no text appears | renderer voice mode and transcription region state | `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`, `frontend/src/renderer/features/chat/hooks/useTranscription.ts`, `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts` | [Frontend Voice Mode Gateway and Transcription Region Reference](../frontend/renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md) | `tests/frontend/VoiceModeHook.test.ts`, `tests/frontend/TranscriptionHook.test.ts`, `tests/frontend/DesktopTranscriptionRegionRuntime.test.ts` |
| `/ws/transcription` rejects or disconnects | backend transcription gateway | private backend implementation | [Voice and Audio Channels](voice_and_audio_channels.md), HTTP and WebSocket Endpoint Reference (private backend docs) | private backend tests, provider-specific transcription tests |
| STT provider events map incorrectly | backend transcription provider adapter | private backend implementation | [Voice and Audio Channels](voice_and_audio_channels.md) | private backend tests |
| backend response has no TTS audio | backend TTS session, manager, processor, provider | private backend implementation | Backend TTS Manager Audio Stream and Cleanup Reference (private backend docs), Backend TTS and Wakeword Audio Runtime Reference (private backend docs) | private backend tests |
| audio chunks arrive but do not play or overlap after stop | renderer app-runtime audio parser and player service | `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`, `frontend/src/renderer/infrastructure/audio/PlayerService.ts`, chat stop/new-query handlers | [Audio Chunk Playback and Stop Semantics Reference](../frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md) | `tests/frontend/AudioChunkEvents.test.js`, audio player tests, stop/new-query tests |

## Ownership Rules

- Renderer owns microphone capture, capture cleanup, dictation UI state, wakeword capture gating, and playback.
- Electron main owns wakeword IPC framing and subprocess lifecycle.
- The local runtime owns wakeword model bootstrap and detection protocol; the local-runtime Python wakeword service is the current concrete implementation.
- Backend transcription route owns `/ws/transcription` connection lifecycle and STT provider normalization.
- Backend TTS owns converting assistant text chunks into `audio-chunk` events on the normal query websocket.
- Settings/config owns whether features are enabled; audio owners should consume normalized settings, not invent parallel flags.

## Change Sequence

1. Identify which audio path is changing: wakeword, dictation, or TTS.
2. Read the owner reference and one adjacent channel doc.
3. Keep the transport separate from the other two audio paths.
4. Preserve permission gating and settings gating.
5. Add owner tests and a boundary test for the next hop.
6. Update [Voice and Audio Channels](voice_and_audio_channels.md), [Voice and Wakeword](../desktop/voice_and_wakeword.md), and feature docs if behavior changes.
7. Run docs validation.

## Wakeword Changes

Use this path for ambient detection, wakeword enablement, microphone chunk
framing into the local-runtime wakeword helper, or wakeword status events.

Primary files:

- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordBridgeEvents.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/wakeword/wakeword_supervisor.cjs`
- `frontend/src/main/python/wakeword_service.py`

Validation:

- `tests/frontend/voice/WakewordDetectionHook.test.ts`
- `tests/frontend/WakewordBridge.test.cjs`
- `tests/frontend/WakewordBridgeRuntime.test.cjs`
- `tests/frontend/WakewordSupervisor.test.cjs`
- `tests/frontend/WakewordEventUtils.test.ts`
- `tests/sidecar/test_wakeword_service.py`

Rules:

- Do not mount wakeword capture during onboarding.
- Do not stream wakeword audio to `/ws/transcription`.
- Keep binary frame contracts stable between Electron main and the
  local-runtime wakeword helper backed by the Python implementation.
- Keep wakeword status events clear enough for renderer UI and debugging.

## Voice Dictation Changes

Use this path for push-to-talk/voice mode capture, transcription websocket payloads, interim/final text events, or composer-region reconciliation.

Primary files:

- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts`
- private backend implementation
- private backend implementation

Validation:

- `tests/frontend/VoiceModeHook.test.ts`
- `tests/frontend/TranscriptionHook.test.ts`
- `tests/frontend/DesktopTranscriptionRegionRuntime.test.ts`
- `tests/frontend/VoiceAudioEncoding.test.ts`
- `tests/frontend/VoiceAudioCleanup.test.ts`
- private backend tests
- STT provider tests for changed adapters.

Rules:

- Keep renderer-facing event protocol stable across STT providers.
- Invalid control JSON or malformed binary frames should not crash the route.
- Preserve cleanup so microphone capture stops on disconnect, cancel, and unmount.
- Keep dictated text reconciliation scoped to the active transcription region.
- Keep renderer voice trace logging routed through
  `DesktopVoiceDebugTraceRuntime.logVoiceDebugTrace(...)` so hooks do not parse
  `debug_voice=1` or emit raw trace logs directly.

## TTS Playback Changes

Use this path for backend speech generation, `audio-chunk` event payloads, renderer playback, stop/new-query cleanup, or overlapping audio.

Primary files:

- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- private backend implementation
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`

Validation:

- private backend tests
- private backend tests
- private backend tests
- private backend tests
- `tests/frontend/AudioChunkEvents.test.js`
- renderer audio player tests.

Rules:

- `audio-chunk` events should stay outside typed text stream state transitions.
- Stop/new-query must clear pending audio and active source immediately.
- TTS failures should not break text streaming.
- Backend TTS session cleanup must run even on disconnect/cancel.

## Settings and Permission Changes

Voice settings and permissions often look like audio bugs. Route them correctly:

- microphone permission: platform permission docs and permission service tests.
- `wakeword_enabled`: renderer settings and wakeword controller gate.
- speech/TTS provider: backend config/provider docs.
- dictation/STT provider: backend transcription config and provider adapter docs.

Start docs:

- Configuration Change Workflow (private backend docs)
- [Settings Sync Change Workflow](../frontend/runtime/settings_sync_change_workflow.md)
- [Platform Permission Matrix](../platforms/permission_matrix.md)
- [Provider Change Workflow](../providers/provider_change_workflow.md)

## Review Checklist

- The change names the audio channel it owns: wakeword, dictation, or TTS.
- Permission and settings gates remain explicit.
- Wakeword, dictation, and TTS transports remain separate.
- Renderer capture cleanup is covered.
- Backend provider normalization is covered when STT/TTS providers change.
- `audio-chunk` playback stop/reset behavior is covered when TTS changes.
- Docs and changelog describe user-visible channel behavior changes.

## Related Docs

- [Voice and Audio Channels](voice_and_audio_channels.md)
- [Voice and Wakeword](../desktop/voice_and_wakeword.md)
- [Renderer Voice Capture and Wakeword Controller Reference](../frontend/renderer/voice_capture_and_wakeword_controller_reference.md)
- [Electron Wakeword Bridge and Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md)
- [Audio Chunk Playback and Stop Semantics Reference](../frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md)
- Backend TTS and Wakeword Audio Runtime Reference (private backend docs)
