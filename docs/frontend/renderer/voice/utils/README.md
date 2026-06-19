---
summary: "Frontend renderer voice utils docs sub-hub for app-runtime PCM/framing helpers, capture cleanup primitives, and transcription-region edit reconciliation contracts."
read_when:
  - When changing voice audio runtime helpers or `frontend/src/renderer/features/voice/utils/*` helpers used by voice-mode and wakeword hooks.
  - When debugging chunk-size normalization drift, audio resource cleanup leaks, or transcription region offset regressions after user edits.
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
- `frontend/src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime.ts`
- `frontend/src/renderer/features/voice/utils/wakewordEventUtils.ts`
- `frontend/src/renderer/features/voice/utils/wakewordCaptureGuard.ts`
- `frontend/src/renderer/features/voice/hooks/useAudioCaptureRefs.ts`
- `frontend/src/renderer/features/chat/hooks/useTranscription.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
