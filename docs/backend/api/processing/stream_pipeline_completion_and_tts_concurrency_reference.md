---
summary: "Deep reference for query stream event processing order, completion-text fallback/backfill rules, and non-blocking TTS task lifecycle guarantees."
read_when:
  - When changing `QueryExecutionService`, `StreamPipeline`, or TTS manager/processor logic.
  - When debugging lost terminal events, empty final responses, audio tail loss, or text-vs-audio ordering issues.
title: "Stream Pipeline, Completion, and TTS Concurrency Reference"
---

# Stream Pipeline, Completion, and TTS Concurrency Reference

## Canonical Modules

- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/tts/processor.py`
- `backend/src/api/processing/tts/manager.py`
- `backend/src/api/services/tts_session.py`

## Query Handler Entry Contract

`QueryMessageHandler.handle_typed(...)`:

1. registers active query task with `SessionManager.register_active_query_task(...)`
2. delegates all orchestration to `QueryExecutionService.execute(...)`
3. maps validation/runtime failure to sanitized websocket errors
4. clears active task in `finally`

Task registration keys used for cancellation correlation:

- `user_id`
- `turn_ref` (`message.id`)
- `conversation_ref`

## QueryExecutionService Stream Flow

High-level order inside `execute(...)`:

1. validate `payload.text`
2. get/create agent session
3. best-effort merge `system_state_internal` into session runtime state
4. prebuild per-turn stream context (`user_id`, `session_id`, `conversation_ref`, `turn_ref`)
5. open `TTSSession` context
6. build `StreamPipeline(tts_processor, formatter, sender)`
7. resolve screenshot from inline payload or artifact reference
8. consume `agent_instance.process_query(...)` stream
9. process every non-terminal event through pipeline

## Completion Resolution and Backfill

Tracked flags/state during iteration:

- `saw_terminal_event`
- `saw_text_chunk`
- `text_chunks[]`
- `last_assistant_full_text`

On `streaming-complete`:

1. resolve completion text with strict precedence:
   - event `final_response`
   - concatenated streamed chunks
   - last assistant full message
   - deterministic fallback message
2. when no chunk was seen but completion text exists:
   - emit synthetic `ChunkEvent(content=completion_text)`
3. emit terminal `StreamingCompleteEvent(final_response=completion_text)`

If stream ends without terminal event:

- service logs warning
- same completion-resolution + emission path runs as fallback

Dict event compatibility for chunk extraction:

- accepted chunk-like event types set:
  - `"chunk"`
  - `"content"`
  - `"streaming-response"`

## StreamPipeline Ordering Guarantees

`StreamPipeline.process(...)` is serial-only per query.

Per-event stage order:

1. format event to websocket payload
2. send payload to transport
3. schedule TTS processing in background task (if TTS enabled)

Transport failure behavior:

- `WebSocketDisconnect`, `RuntimeError`, `ConnectionError` re-raised
- caller stops streaming loop on disconnect path

Pipeline state policy:

- designed as stateless glue for stream semantics
- only minimal task bookkeeping kept (`_pending_tts_tasks`) for concurrency safety

## TTS Concurrency Model

Non-blocking intent:

- text send never waits for TTS work
- TTS errors are isolated and logged

Task lifecycle:

- each event schedules `asyncio.create_task(_run_tts_event(...))`
- tasks tracked in `_pending_tts_tasks`
- done callback removes completed task from set
- query-end barrier uses `wait_for_pending_tts()` before explicit flush

Race fix at query end:

1. await all pending TTS tasks (`gather(return_exceptions=True)`)
2. flush TTS service once to drain queued text
3. TTSSession cleanup calls manager cleanup for shutdown/cancel safety

## TTSProcessor Content Suppression State Machine

State values:

- `None`: undecided/buffering
- `False`: plain text mode
- `True`: suppression mode (`code` or `json`)

Suppression boundaries:

- explicit reset on `ToolCallEvent` and `ToolOutputEvent`
- code suppression enters on backtick marker
- JSON suppression enters on `{` and tracks brace depth to exit on balanced closure
- mid-chunk marker scanning splits text before marker (speak) vs marker section (suppress)

Buffer safety:

- `MAX_BUFFER_SIZE` cap prevents unbounded memory growth in undecided state
- overflow forces text-mode decision and flushes buffer to TTS

## TTSManager + TTSSession Lifecycle

Initialization:

- TTS service created only when `config.speech_mode_enabled` is true

Streaming:

- background `_stream_audio(...)` task emits `audio-chunk` envelopes via `WebSocketSender`
- disconnect errors stop audio loop without crashing query stream

Cleanup:

- `tts_service.flush()` + small wait + shutdown
- audio task cancellation always attempted in `finally`
- cancellation wait is bounded

## Debug Checklist

If terminal completion missing in frontend:

1. confirm `saw_terminal_event` path triggered or fallback emitted at stream end
2. confirm transport send did not raise disconnect before completion emission
3. inspect if formatter returned `None` for completion or backfill chunk (should not for complete)

If text appears but audio misses tail:

1. verify `wait_for_pending_tts()` executes before flush
2. inspect pending task count logs near stream end
3. inspect TTS service flush/shutdown logs for early cancel

If TTS reads tool JSON/code:

1. inspect suppression state transitions in `TTSProcessor`
2. confirm tool boundary events (`ToolCallEvent` / `ToolOutputEvent`) are emitted
3. inspect chunk patterns where markers appear mid-chunk
