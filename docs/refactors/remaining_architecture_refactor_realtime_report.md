---
summary: "Real-time completion report for the remaining architecture refactor plan."
read_when:
  - When reviewing which remaining architecture refactor checklist items have been implemented, verified, and committed.
  - When continuing the deletion-first runtime ownership cleanup after a partial refactor pass.
title: "Remaining Architecture Refactor Real-Time Report"
---

# Remaining Architecture Refactor Real-Time Report

This report is append-only during the refactor pass. Each entry records the
implemented fix, previous behavior, current behavior, validation, and any debt
left behind.

## Move Final Query Prompt Assembly To The Backend

Status: completed.

Commit: included in the same commit as this fix.

Implementation:

- Added backend-owned query-context rendering in
  `backend/src/llm/prompts/query_context.py`.
- Added `query_context` to the backend websocket `QueryPayload` schema so
  desktop clients can send structured memory and attachment context instead of
  final model-visible XML/text.
- Updated backend query input shaping to render `query_context` into
  `message_content` before the agent session/executor sees it.
- Updated Electron main query payload building to send structured
  `query_context` and stop sending `payload.content` for desktop query sends.
- Updated frontend query payload and IPC bridge tests to assert structured
  context instead of main-process XML.
- Added backend rendering tests for memory sections, attachment context, query
  escaping, disabled memory retrieval, and legacy `content` compatibility.
- Added backend query-input and websocket schema coverage for structured
  `query_context`.

Previous behavior:

- Electron main collected local memory and attachment context, then assembled
  the final model-visible `<episodic_memory>`, `<semantic_memory>`,
  `<attached_file_context>`, and `<user_query>` text before sending the backend
  websocket query.
- Backend accepted that pre-rendered `content` and mostly treated it as final
  user message content, so prompt ownership was split between Electron main and
  backend prompt construction.

Current behavior:

- Electron main still collects local memory, attachment context, and system
  state, but sends memory and attachment data as `query_context`.
- Backend owns the final model-visible query text rendering.
- Legacy websocket clients that still send `content` without `query_context`
  remain compatible through the backend renderer fallback.

Success criteria:

- Main sends structured context for desktop query turns: completed.
- Backend owns model-visible query/memory/attachment formatting: completed.
- Memory-enabled, memory-disabled, attachment, escaping, and legacy fallback
  behavior are covered by tests: completed.

Validation:

- `./scripts/python-in-env backend pytest tests/backend/test_query_context_prompt_rendering.py tests/backend/test_query_execution_inputs.py tests/backend/test_websocket_message_handler.py::test_parse_and_validate_message_accepts_structured_query_context tests/backend/test_api_handlers.py::test_query_handler_forwards_query_scoped_context_to_session tests/backend/test_prompt_constructor_utils.py::test_format_user_message_content_adds_tool_schemas_only_for_first_message -q`
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/QueryPayloadBuilder.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs --runInBand`
- `git diff --check`

Skipped or failed validation:

- `./scripts/python-in-env backend pytest tests/backend/test_prompt_constructor_utils.py tests/backend/test_agent_executor_user_query_sanitization.py tests/backend/test_query_execution_service_helpers.py -q` was attempted as an adjacent broad check. It failed in four `test_query_execution_service_helpers.py` cases because those existing tests pass `websocket=object()` while current `QueryExecutionService.execute` calls `websocket.send_json(...)` for `query-accepted`. That failure is unrelated to this query-context migration and should be repaired as a separate test harness cleanup.
