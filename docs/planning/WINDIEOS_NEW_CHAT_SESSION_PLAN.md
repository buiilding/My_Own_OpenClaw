---
summary: "Implementation plan for a UI-level New Chat Session action that starts a fresh conversation_ref and cleanly creates a new backend conversation history on first send."
read_when:
  - Adding a "New Chat" action to WindieOS chat UI.
  - Resetting chat state while preserving transcript/session identity rules.
  - Preventing stale in-flight stream events from contaminating a new conversation.
---

# WindieOS New Chat Session Plan

## Objective

Add a first-class `New Chat` action in the UI that starts a new conversation session and guarantees subsequent messages are written under a new `conversation_ref`, creating a distinct conversation history for backend/transcript storage.

Target behavior:
- User clicks `New Chat`.
- Current chat timeline resets in UI.
- App immediately switches to a fresh `conversation_ref` (for example `conv_<uuid>`).
- First message in the new session is sent with that new `conversation_ref`.
- Backend and transcript storage treat it as a separate conversation history.

## Baseline (Current Behavior)

Current code already supports per-conversation identity, but there is no explicit "start new session" UI action:

- `useChatMessageSender` auto-generates a `conversation_ref` only when none exists (`frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`).
- Active conversation identity is managed by transcript session helpers (`frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`).
- Query payload requires `conversation_ref` on backend schema (`backend/src/api/schemas/incoming.py`).
- Chat state reset exists as `clearMessages()` but is not wired to a user action (`frontend/src/renderer/features/chat/stores/chatStore.ts`).
- Resume flow from Episodic Memory can switch active conversation refs, but this is not the same as creating a brand-new chat (`frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection.jsx`).

## Scope

In scope:
- Add UI trigger for `New Chat`.
- Reset chat runtime state.
- Generate and persist new active `conversation_ref`.
- Ensure next query starts a new backend conversation history.
- Guard against stale stream events from prior conversation.

Out of scope:
- Conversation renaming/titling UX.
- Multi-tab concurrent conversations.
- Backend API redesign (existing `query`/`conversation_ref` contract remains).

## Implementation Plan

## Phase 0: UX + Contract Decisions

Decisions:
- Keep backend contract unchanged; `query` with a new `conversation_ref` is the canonical "new conversation" signal.
- New conversation history is created lazily on first persisted transcript entry/query.
- `New Chat` is available in main chat header (`ChatInterface`) and can be added to overlay later if needed.

Acceptance criteria:
- One approved UX behavior for "discard current view and start new chat".

## Phase 1: Frontend Session Reset Primitive

Add a dedicated session-reset action (single source of truth) that:
- Mints new `conversation_ref` (`conv_${crypto.randomUUID()}`).
- Calls `setActiveConversationRef(newRef)`.
- Clears visible chat messages.
- Resets send/stream UI state (`isSending`, `thinkingStatus`, `tokenCounts`, stream tracking).

Recommended files:
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- New helper module under `frontend/src/renderer/features/chat/` (for orchestration).

Acceptance criteria:
- Calling the reset action always produces a fresh `conversation_ref` and empty chat timeline.

## Phase 2: Wire New Chat UI Action

Add a `New Chat` button to chat header and bind it to the reset primitive.

Recommended file:
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`

UX rules:
- If a stream is active, button either:
  - ends current view immediately and starts new session, or
  - requires confirmation; choose one behavior and test it.
- After click, input stays ready for immediate typing/sending.

Acceptance criteria:
- User-triggered `New Chat` always leaves UI in clean ready state with new session identity.

## Phase 3: Stream Isolation Guard (Race Safety)

Prevent old in-flight events from appearing in newly created conversation.

Implementation:
- In `useChatStream`, ignore backend events whose `conversation_ref` does not match current active conversation.
- Keep local stream tracking aligned with active conversation after reset.

Recommended file:
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`

Acceptance criteria:
- Starting a new chat during/after prior stream does not append stale chunks/tool outputs into new conversation.

## Phase 4: Backend/IPC Compatibility Check

Validate no backend contract change is required:
- `query` already includes `conversation_ref` from UI (`frontend/src/renderer/infrastructure/api/client.ts`).
- IPC query bridge forwards that payload to backend (`frontend/src/main/ipc.cjs`).
- Backend query schema already requires `conversation_ref` (`backend/src/api/schemas/incoming.py`).

Acceptance criteria:
- No protocol changes needed; implementation remains frontend-driven and backward-clean.

## Phase 5: Test Plan

Frontend unit/integration coverage:
- `ChatInterface` test: clicking `New Chat` clears timeline and leaves composer ready.
- Chat state test: reset action clears message + stream/token/sending flags.
- Sender test: first post-reset send uses the newly generated `conversation_ref`.
- Stream test: mismatched `conversation_ref` events are ignored after reset.
- Transcript/session test: `setActiveConversationRef(newRef)` persists and emits update event.

Suggested test files:
- `tests/frontend/ChatInterface*.test.*` (new or existing suite)
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/ChatStream*.test.*`
- `tests/frontend/TranscriptWriter.test.ts`

Manual validation:
- Send message in conversation A.
- Click `New Chat`.
- Send message in conversation B.
- Verify episodic history shows separate conversation threads and backend events on B use only B ref.

## Risks and Mitigations

- Risk: stale stream events leaking into new session.
  - Mitigation: conversation-ref event filtering in `useChatStream`.
- Risk: partial reset leaves stale token/sending state.
  - Mitigation: one atomic reset action instead of scattered setters.
- Risk: behavior mismatch between main window and overlay chat surfaces.
  - Mitigation: centralize reset primitive and call it from both surfaces if/when overlay support is added.

## Rollout Checklist

1. Land reset primitive + tests.
2. Land UI button + interaction test.
3. Land stream isolation guard + regression tests.
4. Verify no backend/schema change required.
5. Update docs/user guide for New Chat behavior.
