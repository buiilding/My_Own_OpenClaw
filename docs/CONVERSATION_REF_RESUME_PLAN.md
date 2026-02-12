---
summary: "Conversation ref + episodic resume implementation plan"
read_when:
  - When implementing resumable episodic conversations.
  - When changing backend/renderer message contracts for chat identity.
---

# Conversation Ref + Resume Plan (No Code Yet)

## Goal
Replace session-bound transcript behavior with conversation-bound behavior so users can:

1. Open episodic memory.
2. Pick a past conversation.
3. Continue in that same conversation.
4. Keep all history (including images) available when resumed.

## Decisions Locked (From User)

1. Conversation ID/token is frontend-generated.
2. Resume sends full conversation history to backend, including images.
3. Tool turns are included in resumed history/context.
4. Default resume behavior appends to same conversation.
5. Keep one backend session; rehydrate on conversation switch.
6. Use current UI-selected model on resume (no forced historical model restore).
7. Legacy stored conversations are not resumable; new refs only.

## Current Problem Summary

1. Backend/renderer currently use backend `session_id` as transcript grouping token.
2. `query` payload has no conversation reference field.
3. Renderer transcript writing depends on event flow and can miss user-turn writes in some window paths.
4. Episodic memory UI is browse-only; no continue action.
5. Backend emits request-level `id`, not conversation-level identity.

## Target Architecture

## 1) Identity Model

1. Introduce `conversation_ref` (frontend-generated, stable, opaque string like `conv_<uuid>`).
2. Conversation ref becomes canonical thread pointer across:
   - frontend state,
   - websocket payloads,
   - transcript persistence,
   - episodic memory listing/loading.
3. Backend `session_id` remains transport/session runtime identity only, not transcript thread identity.

## 2) Runtime Model

1. Keep single backend session per user connection.
2. On conversation switch, frontend sends full transcript snapshot for selected `conversation_ref`.
3. Backend clears/rebuilds in-memory conversation history from that snapshot (rehydrate).
4. Subsequent `query` messages only need `conversation_ref` pointer (no repeated full snapshot unless switched).

## 3) Data Ownership

1. Source of truth for stored transcript = frontend local DB (sidecar SQLite).
2. Backend in-memory history = rehydrated projection of selected conversation.
3. Episodic tab reads from local DB and can activate same `conversation_ref`.

## Protocol Changes

## A) Client -> Backend

### `query` payload (extend)

Add:
1. `conversation_ref: string` (required for chat queries after migration).

Keep existing:
1. `text`
2. `content` (system+memory enriched body)
3. `screenshot_ref`

### New message type: `rehydrate-conversation`

Payload:
1. `conversation_ref: string`
2. `messages: Array<...>` ordered, full transcript rows
3. Each message includes:
   - `role` (`user|assistant|tool`)
   - `content`
   - `message_type`
   - `tool_name` (optional)
   - `correlation_id` (optional)
   - `timestamp`
   - `screenshot_ref` (preferred) and optional inline `screenshot` fallback
4. `rehydrate_mode: "replace"` (single mode for now)

Purpose:
1. Explicit backend history rebuild when switching conversation.
2. Avoid sending full transcript on every query.

## B) Backend -> Client envelope

Add top-level context fields on all stream events:
1. `conversation_ref`
2. optional `turn_ref` (recommended: per user query turn UUID)

Keep:
1. `session_id`
2. `user_id`

Rationale:
1. Frontend transcript routing should use conversation identity directly.
2. `session_id` can rotate/reconnect without breaking transcript grouping.

## Frontend Plan

## 1) Conversation State

Create/persist active conversation identity in renderer:

1. Add `activeConversationRef` to transcript/session state storage.
2. Add API:
   - `setActiveConversationRef(ref)`
   - `getActiveConversationRef()`
3. Stop treating backend `session_id` as conversation key.

## 2) Sending Flow

Before first message in a new chat:
1. Generate `conversation_ref`.
2. Persist it in transcript session state.

On normal send:
1. Ensure `conversation_ref` exists.
2. Send `query` with `conversation_ref`.
3. Persist user row directly at send-time (not only via `local-user-message` relay).

On conversation switch/resume:
1. Load full transcript rows from local DB for selected `conversation_ref`.
2. Send `rehydrate-conversation` once.
3. Set active conversation to that ref.
4. Navigate back to Chat tab with loaded UI history.
5. Next query appends to same ref.

## 3) Transcript Writer

1. Replace `sessionId` write key with `conversationRef` for `store-transcript`.
2. Keep user ID handling unchanged.
3. Keep pending queues, but flush against `conversationRef`.

## 4) Episodic Memory UI

Add “Continue conversation” action:

1. Available only for resumable refs (new format).
2. Clicking it:
   - sets active `conversation_ref`,
   - triggers backend rehydrate,
   - switches layout to Chat,
   - loads transcript messages into chat store.

Legacy rows:
1. Continue disabled.
2. Show label “Legacy conversation (view-only)”.

## 5) Main-process IPC

1. Include `conversation_ref` in forwarded `query` payload.
2. Include `conversation_ref` in `local-user-message` payload.
3. Keep response broadcasts, but transcript persistence no longer relies only on rebroadcast path.

## Sidecar / Local DB Plan

## 1) Storage Key

1. Use `conversation_id` column as canonical storage for new `conversation_ref` values.
2. Enforce new refs with prefix `conv_` for resumable records.

## 2) Resume Eligibility

1. `list_conversations` response should expose `is_resumable`:
   - true: `conversation_id` matches new `conv_` format
   - false: legacy/non-matching IDs

## 3) Write Paths

1. `store_transcript` accepts `conversation_ref` (mapped to `conversation_id` internally).
2. All new rows written with `record_kind='transcript'` + `conversation_ref`.
3. No migration/backfill from legacy session IDs into new refs.

## Backend Plan

## 1) Schemas

1. Extend incoming `QueryPayload` with `conversation_ref`.
2. Add incoming `RehydrateConversationMessage` + payload schema.
3. Extend outgoing schema models/types to include `conversation_ref` (+ optional `turn_ref`).

## 2) Session Runtime

Add rehydrate service in session:

1. Validate payload belongs to active user.
2. Clear existing `ConversationHistory`.
3. Rebuild history entries in order, including tool outputs and image attachments.
4. Resolve `screenshot_ref` through artifact store to inline base64 when needed for multimodal history.
5. Mark session’s active `conversation_ref`.

## 3) Query Execution

1. Require/validate `conversation_ref` for query path post-migration.
2. Attach `conversation_ref` to stream event context for all outbound events.
3. Keep current UI-selected model behavior via existing settings flow (no historical model restore).

## 4) Image Handling Constraint

User asked “include everything including images”.

Plan:
1. Rehydrate includes all transcript image refs.
2. Backend resolves refs and restores images into history entries.
3. Revisit/adjust current history image-trimming behavior so rehydrated full-image history is preserved for resumed context.
4. Keep hard safety limits; if payload exceeds configured limits, fail with explicit UI error instead of silent truncation.

## Migration / Compatibility

1. Start using new `conversation_ref` only for newly created conversations.
2. Existing legacy conversations remain readable in episodic tab.
3. Legacy conversations are not resumable (per decision #7).
4. No data rewrite job.

## Test Plan

## Backend tests

1. Query schema accepts/requires `conversation_ref`.
2. Rehydrate message validation and error paths.
3. Rehydrate clears + rebuilds history in exact order.
4. Rehydrated tool messages/images appear in prompt history.
5. Outgoing events always include `conversation_ref`.

## Frontend tests

1. New conversation generates/stores `conversation_ref`.
2. User message persistence writes immediately on send with active ref.
3. Resume flow sends `rehydrate-conversation` then query append uses same ref.
4. Episodic section “Continue conversation” navigates and appends.
5. Legacy conversation shows view-only/no-continue behavior.

## Sidecar tests

1. `store_transcript` stores rows keyed by new ref format.
2. `list_conversations` marks resumable vs legacy correctly.
3. `get_conversation` ordering and image fields intact.

## Rollout Phases

## Phase 1: Contract + state
1. Add `conversation_ref` in schemas, renderer state, sidecar write path.
2. Keep existing chat behavior working.

## Phase 2: Rehydrate path
1. Implement `rehydrate-conversation` handler.
2. Wire frontend resume switch flow.

## Phase 3: Episodic continue UX
1. Add continue action in episodic section.
2. Add legacy view-only labeling.

## Phase 4: Hardening
1. Resolve image-limit behaviors for full-history requirement.
2. Finalize integration tests and docs updates.

## Risks / Mitigations

1. Large payload risk on rehydrate.
   - Mitigation: send image refs, strict size validation, explicit failures.
2. Model/context mismatch after switch.
   - Mitigation: always rehydrate before next query; block send until complete.
3. Event identity drift.
   - Mitigation: carry `conversation_ref` on every event, not inferred from `session_id`.

