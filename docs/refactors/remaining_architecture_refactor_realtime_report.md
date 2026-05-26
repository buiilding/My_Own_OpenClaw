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
- Escaped attachment context during backend prompt rendering so attached file
  text cannot close the `<attached_file_context>` wrapper.

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

- `./scripts/python-in-env backend pytest tests/backend/test_query_context_prompt_rendering.py tests/backend/test_query_execution_inputs.py tests/backend/test_websocket_message_handler.py tests/backend/test_api_handlers.py -q`
- `cd frontend && npm run test -- IpcMainBridge.query IpcMainBridge.lifecycle IpcQueryRuntime QueryPayloadBuilder --runInBand`
- `./bin/docs-list`

Skipped or failed validation:

- None for this slice.
