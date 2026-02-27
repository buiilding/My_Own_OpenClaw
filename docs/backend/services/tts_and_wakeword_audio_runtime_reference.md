---
summary: "Backend audio runtime reference for query-time TTS and wakeword greeting flow: config policy, stream pipeline integration, queue/worker internals, and cancellation semantics."
read_when:
  - When changing backend speech behavior (`speech_mode_enabled`), TTS chunk streaming, or wakeword greeting execution.
  - When debugging dropped audio chunks, spoken tool JSON/code leakage, or wakeword greeting timing/cleanup issues.
title: "TTS and Wakeword Audio Runtime Reference"
---

# TTS and Wakeword Audio Runtime Reference

## Canonical Modules

- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/tts/manager.py`
- `backend/src/api/processing/tts/processor.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/core/services/tts_service.py`
- `backend/src/core/services/tts_cuda.py`
- `backend/src/core/services/tts_worker.py`
- `backend/src/core/services/tts_buffer.py`
- `backend/src/core/services/tts_audio.py`
- `backend/src/api/handlers/wakeword.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/core/services/wakeword_service.py`
- `backend/src/core/config/runtime.py`
- `backend/src/agent/session/manager.py`

## Config and Runtime Policy

Key distinction:

- `tts_enabled` is runtime-normalized to `true` by config policy (`assemble_runtime_config` / `apply_runtime_policies`)
- `speech_mode_enabled` is the real per-session gate for whether TTS is used during query/wakeword flows

Session creation/update path (`SessionManager`) always re-applies runtime policies, so frontend config patches can toggle `speech_mode_enabled`, but cannot disable backend TTS runtime capability globally.

## Query-Time TTS Path

Entry path:

1. `QueryMessageHandler.handle_typed`
2. `QueryExecutionService.execute`
3. `TTSSession` async context manager
4. `StreamPipeline` + `TTSProcessor`

`TTSSession` behavior:

- `__aenter__`: initializes `TTSService` only when `speech_mode_enabled` is true, then starts background audio streaming task
- `__aexit__`: cancels/cleans streaming task and service via `TTSManager.cleanup`

Pipeline ordering guarantees:

- text events format/send first (frontend gets text quickly)
- TTS processing runs in background tasks per event
- `wait_for_pending_tts()` runs before flush to avoid last-chunk audio loss

## TTS Event Filtering (`TTSProcessor`)

`TTSProcessor` suppresses model output that should not be spoken:

- code-block-like chunks (backtick markers)
- JSON-like chunks (brace-depth tracked)

State machine:

- `None`: undecided, buffers until content type is clear
- `False`: text mode, pass to TTS
- `True`: suppression mode, drop until exit marker

Reset boundaries:

- explicit tool boundaries (`ToolCallEvent`, `ToolOutputEvent`) reset suppression state

Goal:

- keep audio natural
- avoid speaking tool-call payloads and inline code/json control text

## TTS Runtime Internals (`TTSService`)

Core components:

- `input_queue` (`queue.Queue[str | None]`) for sentence work items
- `TtsWorker` thread for synthesis loop
- `audio_queue` (`asyncio.Queue`) for outbound audio chunk payloads
- `SentenceBuffer` for delimiter-based chunking with max-size forced split guard

Processing flow:

1. stream text chunks appended via `process_text`
2. `SentenceBuffer.append` emits complete sentences (or forced split when buffer > 500 chars)
3. worker thread calls Piper synthesis callback
4. `tts_audio.prepare_audio_data` base64-encodes PCM bytes + sample metadata
5. async audio queue feeds `TTSManager._stream_audio`
6. manager sends `audio-chunk` websocket events

CUDA fallback behavior:

- tries Piper load/synthesis with CUDA first
- CUDA-related failures trigger CPU reload fallback
- background retry loop periodically attempts CUDA recovery

Helper boundary:

- `tts_cuda.is_cuda_error(...)` is the classification predicate for GPU-failure fallback decisions in TTS paths.
- `tts_cuda.format_truncated_error(...)` keeps fallback logs bounded (default 200 chars) before warning/error emission.
- OCR uses a separate CUDA helper surface (`services/ocr/helpers.py`) and should not be assumed identical.

## Outbound Audio Chunk Contract (Runtime)

`TTSManager._stream_audio` sends:

- `type: "audio-chunk"`
- `id: <turn_ref>`
- `payload`: dictionary from `prepare_audio_data(...)`

Renderer playback path currently requires:

- `payload.audio` (base64 PCM16 bytes)
- `payload.sample_rate` (number)

Additional payload fields may be present; renderer audio extractor only depends on the two fields above.

## Wakeword Greeting Path

Entry path:

1. frontend sends `wakeword-detected`
2. `WakewordHandler.handle_typed`
3. `WakewordExecutionService.execute`
4. `WakewordService.select_greeting`
5. optional TTS through same `TTSSession` + `TTSManager`

Wakeword response sequence (always sent):

1. `wakeword-activated` payload from `WakewordService.get_activation_payload(...)`
2. `wakeword-greeting` payload `{ text: <selected greeting> }`

If `speech_mode_enabled` is true:

- greeting text is synthesized
- service flushes and waits for synthesis completion
- execution waits briefly for audio-stream drain

`wakeword-activated` payload fields:

- `voice_mode_enabled: true`
- `speech_mode_enabled: <session config>`
- `greeting`
- `status: "listening"`

## Cancellation, Timeout, and Cleanup Semantics

Query cancellation/disconnect safety:

- active query task tracked by `SessionManager`
- transport disconnection errors stop stream loop
- `TTSSession` cleanup still runs on cancellation

TTS cleanup path:

- flush buffered text
- bounded waits for processing completion
- shutdown worker + cancel retry task
- cancel/wait audio streaming task with short timeout

Wakeword path uses the same cleanup guarantees through `TTSSession`, so greeting audio tasks are not left orphaned after disconnects.

## Debug Checklist

If no audio on query responses:

1. verify session `speech_mode_enabled` true
2. verify TTS model path resolved by runtime policy
3. inspect `audio-chunk` events on websocket stream

If tool JSON/code is spoken:

1. inspect `TTSProcessor` suppression transitions
2. confirm tool boundary events (`tool-call`/`tool-output`) are emitted upstream
3. check chunk content for unusual markers bypassing heuristic gates

If wakeword greeting text appears but no greeting audio:

1. verify wakeword activation payload shows `speech_mode_enabled: true`
2. inspect `TTSManager.initialize_if_enabled` path for service creation
3. inspect timeout warnings around `wait_for_audio_completion`

## Related API-Layer Deep Dives

- `docs/backend/api/processing/tts/README.md`
- `docs/backend/api/processing/tts/tts_manager_audio_stream_and_cleanup_reference.md`
- `docs/backend/api/processing/tts/tts_processor_suppression_state_machine_reference.md`
- [TTS CUDA Error Detection and Log-Truncation Helper Reference](tts_cuda_error_detection_and_log_truncation_helper_reference.md)
