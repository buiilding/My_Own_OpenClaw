---
summary: "Deep reference for API-layer TTS manager/session behavior: speech gate, audio-chunk send loop, disconnect handling, and bounded cleanup/cancellation semantics."
read_when:
  - When changing `TTSManager` or `TTSSession` lifecycle behavior.
  - When debugging audio task hangs, disconnect races, or wakeword greeting TTS drain issues.
title: "TTS Manager Audio Stream and Cleanup Reference"
---

# TTS Manager Audio Stream and Cleanup Reference

## Canonical Modules

- `backend/src/api/processing/tts/manager.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/contracts/message_types.py`
- `backend/src/api/transport/protocol.py`

## Session Gate and Initialization

`TTSManager.initialize_if_enabled(config)`:

- creates `TTSService` only when `config.speech_mode_enabled` is true
- calls `tts_service.initialize()`
- returns `None` when speech mode disabled

This is the API-layer gate used by both query and wakeword flows.

## TTSSession Contract

`TTSSession` is the per-request async context manager.

`__aenter__`:

1. initializes service through manager gate
2. starts background audio task when service exists
3. stores `service` + `audio_task` for later cleanup

`__aexit__`:

1. pre-cancels unfinished audio task
2. delegates cleanup to `TTSManager.cleanup(...)`

`wait_for_audio_completion(timeout)`:

- waits for running audio task to drain already-generated chunks
- used by wakeword execution after `wait_until_finished(...)`

## Audio Chunk Relay Loop

`TTSManager.start_streaming_task(...)` spawns `_stream_audio(...)`.

`_stream_audio(...)`:

- async-iterates `tts_service.stream_audio()`
- sends websocket envelope via `WebSocketSender.send_json(...)`
- message shape:
  - `type: "audio-chunk"`
  - `id: <turn_ref>`
  - `payload: <audio chunk dict>`

Disconnect behavior:

- on `RuntimeError` or `ConnectionError`, logs debug and breaks loop
- avoids propagating disconnect exceptions into query/wakeword business path

## Cleanup Ordering and Bounds

`TTSManager.cleanup(service, audio_task)`:

1. if service exists:
   - `flush()`
   - brief wait (`TTS_FLUSH_WAIT_TIME`)
   - `shutdown()`
2. regardless of service cleanup success:
   - cancel unfinished audio task
   - bounded wait for cancellation propagation (`AUDIO_TASK_CANCELLATION_WAIT`)

Design intent:

- service cleanup errors must not skip task cleanup
- cancellation waits are bounded to avoid request teardown hangs

## Query Flow Integration

In `QueryExecutionService.execute(...)`:

1. open `TTSSession`
2. pipeline schedules per-event TTS tasks
3. after stream loop, query path awaits pending pipeline TTS tasks
4. query path flushes TTS service once before context exit
5. context exit runs manager cleanup

This layered barrier model reduces tail-audio truncation.

## Wakeword Flow Integration

In `WakewordExecutionService.execute(...)`:

1. open `TTSSession`
2. send `wakeword-activated` and `wakeword-greeting` events
3. if TTS service exists:
   - `process_text(greeting)`
   - `flush()`
   - `wait_until_finished(timeout=10.0)`
   - `wait_for_audio_completion(timeout=5.0)` best effort

Failures:

- timeout waiting on audio task logs warning, does not fail request
- disconnect-like task errors logged at debug level

## Drift and Failure Hotspots

1. changing `audio-chunk` payload shape without renderer extractor updates
2. removing bounded waits causing stuck request teardown
3. skipping `finally`-style task cleanup and leaking background tasks
4. bypassing `TTSSession` in new handlers and duplicating cleanup logic

## Debug Checklist

If audio chunks never reach frontend:

1. verify `speech_mode_enabled` true in active session config
2. verify `_stream_audio` task was started (`TTSSession.__aenter__`)
3. inspect transport errors for early disconnect break

If teardown hangs or leaves tasks:

1. inspect whether cleanup reached task-cancel branch
2. check timeout/cancellation constants for accidental inflation
3. verify callers use `TTSSession` instead of manual service lifecycle code
