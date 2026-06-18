---
summary: "Deep reference for non-query API services: transcript rehydrate normalization/linkage validation, wakeword greeting activation sequence, and shared TTSSession setup/cleanup guarantees."
read_when:
  - When changing `RehydrateExecutionService`, `WakewordExecutionService`, or `TTSSession` lifecycle behavior.
  - When debugging resumed-conversation tool-call linkage, screenshot-ref hydrate behavior, or wakeword greeting audio completion timing.
title: "Rehydrate and Wakeword Execution Service and TTS Session Reference"
---

# Rehydrate and Wakeword Execution Service and TTS Session Reference

## Canonical Modules

- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/api/services/rehydrate_entry_normalization.py`
- `backend/src/api/services/rehydrate_tool_linkage.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/handlers/rehydrate.py`
- `backend/src/api/handlers/wakeword.py`
- `tests/backend/test_api_handlers.py`

## Rehydrate Service Ownership

`RehydrateExecutionService.execute(...)` owns rehydrate orchestration while
`rehydrate_entry_normalization.py` owns row-level normalization/parsing.

Flow:

1. get/create session
2. optionally build artifact store from backend config
3. normalize each SDK conversation snapshot entry (shared normalizer)
4. validate tool linkage with `RehydrateToolLinkageState`
5. reject transcripts that leave unanswered pending tool calls
6. call `session.rehydrate_conversation(conversation_ref, hydrated_entries)`

## Entry Normalization Model

Per-entry fields normalized:

- message type, which must already be a canonical stored `MessageType` value
  (`user_query`, `assistant_response`, `tool_output`, or
  `context_compaction`) when present; missing values may fall back from role
- tool name / correlation / tool_call_id string normalization
- screenshot resolution via `screenshot_ref`
- internal bundle trace rows are recognized from explicit bundle tool-name
  metadata, not by stale message-type aliases or JSON-looking message content

### Tool-call reconstruction

For assistant rows with tool calls:

- accept only structured `tool_calls` rows or structured payload
  `toolCalls[]` entries with canonical `arguments`
- emit assistant entries with `tool_calls=[{id,name,arguments}]`
- update `known_tool_call_ids` and `pending_tool_call_ids`
- reject stale message-type aliases such as `tool-call` instead of parsing
  JSON content as a fallback tool call

### Tool-output linkage validation

For tool rows or canonical `tool_output` rows:

- choose call id from explicit tool_call_id, correlation_id, or pending call id
- reject tool outputs that cannot be linked to a known tool call
- then append tool row with resolved `tool_call_id`
- explicit tool output ids consume their matching pending tool-call id even if outputs arrive out of order

### Missing tool-output rejection

If rehydrate reaches the end of the transcript with unanswered pending tool calls:

- raise `ValueError`
- do not write partial rehydrated history to the session

This removes the previous compatibility repair path. Current transcript
projections must persist complete assistant-tool -> tool-output linkage instead
of relying on backend rehydrate to invent missing rows or ids.

## Screenshot Resolution Behavior During Rehydrate

`_resolve_image_data(...)` order:

1. `screenshot_ref` load via artifact store
2. no screenshot

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
- `__aexit__`: call manager cleanup, which shuts down the service before bounded
  audio task cancellation
- `wait_for_audio_completion(timeout)`: waits only when task exists and still running

For ElevenLabs, `TTSSession` installs a deferred proxy so the provider is not
initialized until the first text chunk. If no text arrives, proxy shutdown wakes
the background audio iterator and lets it return without opening the provider.

This provides consistent setup/teardown for both query and wakeword service flows.

## Test-Backed Invariants

`tests/backend/test_api_handlers.py` validates:

- wakeword handler emits `wakeword-activated` then `wakeword-greeting`
- rehydrate basic history rebuild and conversation_ref routing
- missing screenshot-ref load continues without websocket errors
- resumed transcript tool-call/tool-output linkage validation yields assistant/tool alternating structure with matched ids

## Drift Hotspots

1. allowing fallback tool-call ids can reintroduce provider-history rows that never existed in the transcript.
2. accepting JSON-content tool-call parsing can reintroduce old transcript
   parser aliases; current SDK rehydrate projections must send structured
   `tool_calls` / `toolCalls[]` instead.
3. accepting singular structured-payload `toolCall` can reintroduce old replay
   aliases; current SDK rehydrate projections use `toolCalls[]`.
4. accepting old message-type aliases such as `assistant-message`,
   `tool-output`, or `tool-call` can hide projection drift at the SDK/backend
   boundary.
5. accepting unknown tool-output ids can orphan tool rows.
6. accepting direct `screenshot` or `image_data` rehydrate fields can reintroduce large inline replay payloads.
7. changing TTSSession cleanup semantics risks leaked audio tasks across requests.

## Related Pages

- [Backend API Services Docs Hub](README.md)
- [Query Execution Service Stream Context and Completion Fallback Reference](query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Non-Query Handler Dispatch and Payload Normalization Reference](../handlers/non_query_handler_dispatch_and_payload_normalization_reference.md)
