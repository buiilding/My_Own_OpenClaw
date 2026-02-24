---
summary: "Backend API processing TTS docs sub-hub for manager audio streaming lifecycle, processor suppression state machine, and TTSSession cleanup contracts."
read_when:
  - When changing `backend/src/api/processing/tts/*` behavior.
  - When debugging audio chunk relay failures, TTS cleanup races, or spoken tool JSON/code leakage.
title: "Backend API Processing TTS Docs Hub"
---

# Backend API Processing TTS Docs Hub

## Deep Pages

- [TTS Manager Audio Stream and Cleanup Reference](tts_manager_audio_stream_and_cleanup_reference.md)
- [TTS Processor Suppression State-Machine Reference](tts_processor_suppression_state_machine_reference.md)

## Code Scope

- `backend/src/api/processing/tts/manager.py`
- `backend/src/api/processing/tts/processor.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/services/wakeword_execution.py`
