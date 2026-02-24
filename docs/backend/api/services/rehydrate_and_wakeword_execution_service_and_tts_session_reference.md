---
summary: "Deep reference for non-query API services: transcript rehydrate normalization/linkage rebuilding, wakeword greeting activation sequence, and shared TTSSession setup/cleanup guarantees."
read_when:
  - When changing `RehydrateExecutionService`, `WakewordExecutionService`, or `TTSSession` lifecycle behavior.
  - When debugging resumed-conversation tool-call linkage, screenshot-ref hydrate behavior, or wakeword greeting audio completion timing.
title: "Rehydrate and Wakeword Execution Service and TTS Session Reference"
---

# Rehydrate and Wakeword Execution Service and TTS Session Reference

## Canonical Modules

- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/handlers/rehydrate.py`
- `backend/src/api/handlers/wakeword.py`
- `tests/backend/test_api_handlers.py`

## Rehydrate Service Ownership

`RehydrateExecutionService.execute(...)` owns transcript snapshot normalization before session write.

Flow:

1. get/create session
2. optionally build artifact store from backend config
3. normalize each frontend transcript entry
4. rebuild tool linkage when needed
5. call `session.rehydrate_conversation(conversation_ref, hydrated_entries)`

## Entry Normalization Model

Per-entry fields normalized:

- message type (`tool-call`, `tool-output`, aliases)
- tool name / correlation / tool_call_id string normalization
- screenshot resolution via inline `screenshot` or `screenshot_ref`

### Tool-call reconstruction

For tool-call-like rows:

- generate/fallback call id (`rehydrate_tool_call_<index>`) when missing
- parse JSON content for `name` and `args/arguments`
- emit assistant entry with `tool_calls=[{id,name,arguments}]`
- update `known_tool_call_ids` and `pending_tool_call_id`

### Tool-output linkage repair

For tool/tool-output rows:

- choose call id from explicit tool_call_id, correlation_id, pending call id, or generated fallback
- if call id not known yet, inject synthetic assistant tool-call row first
- then append tool row with resolved `tool_call_id`

This ensures provider-normalized history can maintain assistant-tool -> tool-output linkage.

## Screenshot Resolution Behavior During Rehydrate

`_resolve_image_data(...)` order:

1. inline `screenshot`
2. `screenshot_ref` load via artifact store
3. no screenshot

Failure handling:

- per-ref load failures: warning + continue with `image_data=None`
- artifact store unavailable with screenshot_ref present: explicit `ValueError` path

`_build_artifact_store(...)` itself is tolerant and returns `None` on creation failure with warning.

## Wakeword Service Ownership

`WakewordExecutionService.execute(...)` sequence:

1. select greeting (`WakewordService.select_greeting`)
2. open `TTSSession`
3. send `wakeword-activated` payload
4. send `wakeword-greeting` text payload
5. if TTS available:
- process greeting text
- flush generated audio
- wait for TTS service completion (`wait_until_finished(timeout=10.0)`)
- wait for audio streaming task completion window (`wait_for_audio_completion(timeout=5.0)`)
6. log activation completion

Timeout/error during final audio wait is treated as warning/debug, not fatal handler failure.

## Shared `TTSSession` Lifecycle Contract

`TTSSession` context manager behavior:

- `__aenter__`: initialize optional TTS service and start streaming task
- `__aexit__`: cancel unfinished audio task and call manager cleanup
- `wait_for_audio_completion(timeout)`: waits only when task exists and still running

This provides consistent setup/teardown for both query and wakeword service flows.

## Test-Backed Invariants

`tests/backend/test_api_handlers.py` validates:

- wakeword handler emits `wakeword-activated` then `wakeword-greeting`
- rehydrate basic history rebuild and conversation_ref routing
- missing screenshot-ref load continues without websocket errors
- resumed transcript tool-call/tool-output linkage reconstruction yields assistant/tool alternating structure with matched ids

## Drift Hotspots

1. changing tool-call reconstruction fallback ids can break deterministic linkage for partial transcripts.
2. removing synthetic assistant call insertion for unknown tool-output ids can orphan tool rows.
3. tightening screenshot-ref failures to hard abort can make conversation resume brittle on artifact loss.
4. changing TTSSession cleanup semantics risks leaked audio tasks across requests.

## Related Pages

- [Backend API Services Docs Hub](README.md)
- [Query Execution Service Stream Context and Completion Fallback Reference](query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Non-Query Handler Dispatch and Payload Normalization Reference](../handlers/non_query_handler_dispatch_and_payload_normalization_reference.md)
