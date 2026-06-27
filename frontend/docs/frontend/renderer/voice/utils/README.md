---
summary: "Frontend renderer voice runtime-helper docs sub-hub for app-runtime PCM/framing helpers, audio-input browser adapters, wakeword guard/event helpers, capture cleanup primitives, and transcription-region edit reconciliation contracts."
read_when:
  - When changing voice audio, wakeword guard/event, or transcription-region runtime helpers used by voice-mode and wakeword hooks.
  - When debugging chunk-size normalization drift, microphone device-change recovery, audio resource cleanup leaks, or transcription region offset regressions after user edits.
title: "Frontend Renderer Voice Utils Docs Hub"
---

# Frontend Renderer Voice Utils Docs Hub

## Deep Pages

- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Wakeword Capture Guard Utility Reference](wakeword_capture_guard_global_lockout_and_device_probe_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](transcription_region_state_machine_and_input_edit_reconciliation_reference.md)

## Related Pages

- [Frontend Renderer Voice Docs Hub](../README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](../wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Voice Capture and Wakeword Controller Reference](../../voice_capture_and_wakeword_controller_reference.md)

## Code Scope

- `frontend/src/renderer/app/runtime/desktopVoiceAudioEncodingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioCaptureCleanupRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioInputDeviceRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopWakewordCaptureGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceDebugTraceRuntime.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
