---
summary: "Voice and wakeword guide covering renderer capture, wakeword bridge, STT websocket, voice status UI, TTS playback, and provider routing."
read_when:
  - When changing voice mode, wakeword detection, transient dictation, STT, TTS, or voice status UI.
  - When debugging microphone or audio streaming behavior.
title: "Voice and Wakeword"
---

# Voice and Wakeword

WindieOS voice has three related paths: wakeword detection, transient voice dictation, and backend speech/audio output. Keep them distinct when debugging.

## Main Files

- Wakeword controller: `frontend/src/renderer/app/WakewordController.jsx`
- Voice hooks: `frontend/src/renderer/features/voice/hooks/*`
- Voice/wakeword runtime helpers: `frontend/src/renderer/app/runtime/desktopVoiceAudio*Runtime.ts`, `frontend/src/renderer/app/runtime/desktopWakeword*Runtime.ts`, `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- Voice status UI: `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`
- Main wakeword bridge: `frontend/src/main/wakeword/wakeword_bridge*.cjs`
- Local-runtime wakeword service implementation: `frontend/src/main/python/wakeword_service.py`
- Backend transcription route/service: private backend implementation
- Backend TTS: private backend implementation

## Runtime Rules

- Onboarding should not mount wakeword capture.
- Wakeword capture streams through the Electron bridge to the local-runtime wakeword helper backed by the local-runtime Python wakeword service.
- Voice mode transcription uses the dedicated `/ws/transcription` backend websocket, not the normal agent `/ws` channel.
- OpenAI and Nova STT modes share the renderer protocol.
- TTS audio chunks arrive through backend stream events and are played by renderer audio services.

## Deep Docs

- [Voice Audio Change Workflow](../channels/voice_audio_change_workflow.md)
- [Renderer Voice Capture + Wakeword Controller Reference](../frontend/renderer/voice_capture_and_wakeword_controller_reference.md)
- [Electron Wakeword Bridge + Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md)
- Backend TTS + Wakeword Audio Runtime Reference (private backend docs)
- [API Reference](../reference/api_reference.md)
