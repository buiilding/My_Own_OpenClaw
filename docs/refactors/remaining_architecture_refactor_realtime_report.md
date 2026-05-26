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

## Delete The Renderer-Owned Backend Event Contract

Status: completed.

Commit: included in the same commit as this report entry.

Implementation:

- Deleted `frontend/src/renderer/types/backendEvents.ts`, removing the
  renderer-owned raw backend event unions, payload validators, and
  `isBackendEvent` guard.
- Deleted the renderer `BackendEvents.test.ts` guard tests because raw backend
  event validation now belongs in SDK/backend transport tests, not renderer
  display tests.
- Added renderer-owned `toolSchemas.ts` for display/transcript tool-schema
  typing that does not imply websocket event ownership.
- Kept stream tracking labels display-only by typing them as renderer-local
  strings instead of mirroring backend event unions.
- Updated renderer transcript/chat utilities to import display tool-schema
  types or local payload-like shapes instead of backend event contracts.
- Added a runtime-boundary test proving
  `frontend/src/renderer/types/backendEvents.ts` remains deleted.

Previous behavior:

- Renderer owned a duplicate raw backend websocket event contract with event
  unions, validators, and payload shapes.
- Some renderer utilities imported that module only to borrow tool-schema or
  tool payload types, keeping a misleading dependency on backend event shapes.

Current behavior:

- SDK remains the client-side owner for raw backend event types and
  normalization.
- Renderer keeps only display-scoped tool-schema types, source labels, and
  local payload-like formatter types.
- Chat feature code and runtime boundary tests continue to enforce that raw
  backend event normalization stays outside renderer feature code.

Success criteria:

- Renderer has no raw backend websocket event contract: completed.
- SDK remains the single client-side backend event normalization boundary:
  completed.
- Renderer display utilities no longer import `types/backendEvents`: completed.

Validation:

- `cd frontend && npm run test -- RendererChatRuntimeBoundary ChatStreamMetadataHandlers DesktopChatStreamTrackingRuntime DesktopChatStreamEventRuntime ChatStreamMessageUpdates ToolSchemaShape --runInBand`
- `cd frontend && npm run test -- WindieSdkConversationRuntime --runInBand`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `./bin/docs-list`
- `git diff --check`

Skipped or failed validation:

- None for this slice.
