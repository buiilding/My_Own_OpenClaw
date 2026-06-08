---
summary: "Plan for restoring WindieOS generated conversation title enrichment after the first completed user plus assistant exchange while keeping first-user-message fallback deterministic."
read_when:
  - When changing generated conversation title timing, SDK conversation runtime terminal-turn behavior, sidecar conversation title persistence, or dashboard title refresh.
  - When debugging recent chats that stay on first-user-message titles or conversation ids after a completed assistant reply.
title: "SDK Generated Conversation Title Enrichment Plan"
---

# SDK Generated Conversation Title Enrichment Plan

Date: 2026-06-08

## User Intent

Generate a model-backed conversation title after the first successful user plus
assistant text pair, while keeping the first user message as the immediate and
reliable provisional title.

The desired product path is:

1. First user message lands immediately as provisional title.
2. First successful assistant `llm-text` completes.
3. SDK detects that the conversation has first user plus first assistant text
   and no locked/manual/model title.
4. SDK calls backend title generation using active model/provider context.
5. SDK writes the generated title through the local sidecar title update RPC.
6. Sidecar persists it and emits conversation metadata invalidation.
7. Renderer reloads sidebar metadata from the SDK conversation library.

Generated title failure must not block chat persistence, chat visibility,
conversation replay, or sidebar listing. The fallback remains:

```text
stored/manual/model title -> first user_message -> conversation_id
```

## Architectural Target

WindieOS should keep one owner per part of the behavior:

| Behavior | Owner |
| --- | --- |
| First-user provisional title fallback | Sidecar conversation metadata query |
| Detection after completed first exchange | SDK conversation runtime |
| Backend title model call | SDK through hosted backend client |
| Local title persistence | Sidecar local memory title store |
| Title invalidation event | Sidecar event sink normalized by SDK local-runtime event source |
| Sidebar refresh/display | Renderer dashboard through SDK conversation metadata facade |

The removed sidecar `RemoteTitleClient` path must stay deleted. Sidecar Python
must not call hosted backend title routes directly. Electron renderer must not
run its own title-generation heuristic or direct sidecar title listener.

## Current Evidence

- Current local DB has recent conversations with assistant messages but zero
  `conversation_titles` rows, proving generated-title enrichment is not running.
- Backend `/api/semantic/title` still exists and is tested.
- SDK exposes `agent.generateConversationTitle(...)` and
  `agent.updateConversationTitle(...)`.
- Sidecar exposes `update_conversation_title` and persists through
  `conversation_titles`.
- Recent refactors moved memory embeddings and conversation runtime ownership to
  the SDK, but did not add the replacement SDK title-generation trigger.
- Codex and OpenClaw local session lists rely on deterministic first-message
  fallback or explicit names; WindieOS should keep that baseline and add model
  title enrichment as best-effort behavior.

## In Scope

- Add SDK-owned generated-title orchestration after first successful assistant
  text for a conversation.
- Ensure title generation runs at most once concurrently per user/conversation
  and does not repeatedly call the backend once a durable title exists.
- Query or infer enough conversation metadata to avoid overwriting manual or
  locked titles.
- Persist generated title via existing sidecar `update_conversation_title`.
- Preserve existing sidecar metadata fallback and invalidation behavior.
- Add focused frontend/SDK and sidecar tests for the title-enrichment path.
- Update docs and `CHANGELOG.md`.

## Out of Scope

- Reintroducing sidecar-owned backend HTTP title clients.
- Changing backend title prompt/parser semantics unless a focused regression is
  found while wiring SDK calls.
- Changing manual rename UX.
- Hiding untitled chats until generated title completion.
- Migrating existing local rows. This should be a no-migration read/write path
  fix unless inspection proves a persisted-data incompatibility.

## Existing Dirty Worktree Note

Before implementation, inspect these currently dirty files and preserve user
changes unless they are directly in conflict with the title work:

- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/projections/currentTurnProjection.ts`
- `packages/windie-sdk-js/src/runtime/conversationReducer.ts`
- matching `cjs/` generated files
- `tests/frontend/WindieSdkConversationRuntime.test.ts`

If the dirty runtime changes make the title implementation ambiguous, pause and
ask before editing those files.

## Implementation Workflow

1. Inspect SDK terminal-turn behavior:
   - `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
   - `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
   - `packages/windie-sdk-js/src/stores/SidecarConversationStore.ts`
   - existing completed-turn memory tests

2. Inspect local title persistence and metadata read path:
   - `frontend/src/main/python/local_backend_memory_handlers.py`
   - `frontend/src/main/python/memory/conversation_title_store.py`
   - `frontend/src/main/python/memory/chat_event_store.py`
   - `tests/sidecar/test_local_backend.py`
   - `tests/sidecar/test_chat_event_store.py`

3. Add the smallest SDK-owned title-enrichment component:
   - detect first completed assistant `llm-text` exchange
   - gather first user and assistant text from the SDK event stream or loaded
     conversation events
   - guard against duplicate in-flight title generation by user/conversation
   - call `generateConversationTitle(...)`
   - persist through `updateConversationTitle(...)`
   - swallow/log generation failures without affecting the completed turn

4. Add title-state protection:
   - do not overwrite locked/manual/generated durable titles
   - if existing sidecar state cannot expose lock/source cleanly through current
     SDK APIs, add a narrow sidecar RPC or metadata field only if it enforces the
     ownership boundary

5. Preserve renderer behavior:
   - verify dashboard listens only to SDK conversation metadata invalidation
   - do not add renderer title-generation logic

6. Update docs:
   - SDK conversation runtime title-enrichment note
   - sidecar memory title ownership note
   - route/change docs only if a public contract changes
   - `CHANGELOG.md`

7. Perform design-inspection loop:
   - reread all touched SDK, sidecar, renderer, and docs paths
   - search for lingering sidecar/backend title-call paths
   - classify every in-scope title path as fixed, preserved, or out of scope

## Validation Plan

Focused validation targets:

```bash
bin/windie test frontend -- WindieSdkClient.test.ts WindieSdkConversationRuntime.test.ts UseDashboardConversations.test.jsx ChatGptDashboardShell.test.jsx
bin/windie test sidecar tests/sidecar/test_local_backend.py tests/sidecar/test_chat_event_store.py -q
bin/windie test backend tests/backend/test_memory_routes.py tests/backend/test_semantic_parser_service.py -q
bin/windie docs list
git diff --check
```

If implementation only touches SDK/frontend and sidecar title persistence, the
backend title-route tests may be run as confidence checks rather than because
backend behavior changed.

## Success Criteria

- A newly completed first assistant text reply triggers one best-effort generated
  title request.
- Title generation is skipped when there is no first user text, no assistant
  text, or an existing locked/manual/model title.
- Backend/title failures are logged or surfaced diagnostically but do not fail
  the completed chat turn.
- Sidecar `conversation_titles` receives the generated title through the
  existing local title persistence path.
- Sidecar emits conversation metadata invalidation and dashboard reloads through
  the existing SDK invalidation path.
- Conversation listing remains correct without generated titles.
- No sidecar Python code imports backend code or directly calls hosted title
  HTTP APIs.
- No renderer-only title-generation path is introduced.
- Plan report records code changes, validation, design-inspection findings, and
  any migration note.

## Assumptions

- Existing backend `/api/semantic/title` behavior is acceptable.
- Existing title parser/shape restrictions remain acceptable.
- Existing title fallback order in `chat_event_store.py` is correct.
- No data migration is required because this restores a missing enrichment write
  path, not a schema change.

## Reread Anchors After Compaction

- This plan.
- Matching report:
  `docs/plans/2026-06-08-sdk-generated-conversation-title-enrichment-report.md`
- `pending/compaction_safe_plan_execution.md`
- `docs/sdk/conversation_runtime.md`
- `docs/memory/sidecar_local_memory.md`
- `docs/frontend/renderer/dashboard/shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
- `packages/windie-sdk-js/src/stores/SidecarConversationStore.ts`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/memory/conversation_title_store.py`
- `frontend/src/main/python/memory/chat_event_store.py`
