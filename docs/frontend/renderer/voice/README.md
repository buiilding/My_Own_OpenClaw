---
summary: "Frontend renderer voice docs sub-hub for gateway transcription lifecycle, wakeword IPC audio capture, cooldown/threshold gating, browser audio-input adapters, and shared audio resource cleanup semantics."
read_when:
  - When changing `frontend/src/renderer/features/voice/*` hooks or utility modules.
  - When debugging microphone capture leaks, wakeword retriggers, or transcription reconnect behavior.
title: "Frontend Renderer Voice Docs Hub"
---

# Frontend Renderer Voice Docs Hub

## Deep Pages

- [Voice Mode Gateway Connection and Transcription Region Reference](voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Renderer Voice Components Docs Hub](components/README.md)
- [Voice Status Error, Recording, and Connection Indicator Contract Reference](components/voice_status_error_recording_and_connection_indicator_contract_reference.md)
- [Voice Utils Docs Hub](utils/README.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Voice Capture and Wakeword Controller Reference](../voice_capture_and_wakeword_controller_reference.md)
- [Frontend Overlay and Wakeword Control Channel Reference](../../contracts/overlay_and_wakeword_control_channel_reference.md)
- [Electron Wakeword Bridge and Audio Framing Reference](../../sidecar/wakeword_bridge_and_audio_framing_reference.md)
- [Frontend Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)

## Code Scope

- `frontend/src/renderer/app/WakewordController.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/voice/components/VoiceStatus.jsx`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/features/voice/hooks/useVoiceMode.ts`
- `frontend/src/renderer/features/voice/hooks/useWakewordDetection.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `tests/frontend/MessageInput.test.jsx`
