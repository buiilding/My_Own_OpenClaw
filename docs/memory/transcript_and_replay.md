---
summary: "Renderer transcript and replay guide covering desktop SDK projection runtime writes, pending queues, session identity, local snapshots, canonical conversation events, and rehydrate payloads."
read_when:
  - When changing renderer transcript projection writes, pending flush behavior, canonical conversation events, local snapshots, or rehydrate payload construction.
  - When debugging visible chat rows that do not persist or replay correctly.
title: "Transcript and Replay"
---

# Transcript and Replay

Renderer transcript rows are visible projections. Canonical client-runtime state is stored in the sidecar `chat_events` table and projected for display, dashboard replay, and backend rehydrate. Neither visible rows nor backend active model history are storage truth.

For code changes or debugging, start with [Transcript Replay Change Workflow](transcript_replay_change_workflow.md). That workflow maps SDK projection writes, pending queues, sidecar event storage, dashboard replay/resume, backend rehydrate payloads, tool-row reconstruction, and validation.

## Code Ownership

| Concern | Files |
| --- | --- |
| Transcript projection write API | `frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient.ts` |
| Transcript session facade | `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`, `desktopTranscriptSessionRuntime.ts` |
| Session identity | `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`, `sessionInfoState.ts`, `sessionInfoStorage.ts` |
| Pending queues | `frontend/src/renderer/infrastructure/transcript/pending/*` |
| Entry persistence | `frontend/src/renderer/infrastructure/transcript/transcriptEntryPersistence.ts`, `transcriptRecordWrite.ts` |
| SDK conversation store adapter | `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts` |
| SDK display to chat-message projection | `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts` |
| Local snapshots/replay | `conversationLocalSnapshotLoader.ts`, `rehydratePayload.js`, `rehydrateMessageState.js` |
| Chat replay actions | `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js` |
| Dashboard conversation list | `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`, `useTranscriptSessionInfo.js` |

## Write Flow

`DesktopTranscriptProjectionRuntimeClient` records:

- user messages,
- assistant messages,
- tool-call rows,
- tool-output rows,
- transparency payloads,
- structured tool payloads,
- screenshot refs,
- model id/provider metadata.

If session identity is not ready, entries are queued through pending transcript queues and flushed when `DesktopTranscriptSessionRuntimeClient` resolves conversation/user identity.

## Session Identity

Transcript session identity includes:

- `conversationRef`,
- `userId`.

Do not invent a second conversation id in a component. Use the transcript session runtime and existing conversation workspace binding.

## Replay And Rehydrate

SDK projections convert stored conversation events back into chat messages for renderer display. Rehydrate converts those events into backend-compatible state so an active backend session can continue.

SDK-owned conversation state uses a dedicated sidecar chat-event table:

- `chat_events`: normalized SDK event log for runtime/load/rehydrate/display
- `attachments`: normalized image attachment records extracted from user-message screenshots, screenshot refs/URLs, artifact refs, and tool-output screenshot payloads
- compaction replay generations: complete `compaction_applied` events with replacement-history entries

SDK callers should read display and rehydrate state through SDK projections over
chat events. The desktop runtime does not write hidden replay rows
or fall back to visible transcript rows for runtime truth.

Edit/resend and try-again rewrites cut the canonical sidecar chat-event log at
the preserved event boundary. The renderer/SDK sends only the cutoff event id,
the new revision id, and one `conversation_rewritten` event; the sidecar deletes
rows after the cutoff and inserts the rewrite marker in one SQLite transaction.
This keeps prior history in SQLite instead of copying a shortened transcript
back through the renderer-to-sidecar request path.

Live sends should use one stable turn/message id across the pending renderer row,
the transcript projection write, and the SDK query turn. Replay first matches
canonical sidecar events by event/payload id. For rows created before that id
contract existed, the renderer also sends the clicked user-message ordinal so
the SDK can cut the matching canonical user event without depending on a
renderer-only UUID.

After a compact edit/resend or retry cut, the replay dispatch must persist the
replacement user turn before sending the query. Otherwise the next assistant
completion would be stored as an assistant-only conversation. SDK display and
rehydrate projection also suppress orphan empty-chat greeting rows when no user
turn exists, so older corrupted replay rows do not become model or UI history.

Full replacement remains available for projection bootstraps and explicit
transcript projection rewrites. A failed replacement or cutoff rewrite leaves
the previous transcript intact.

Dashboard recent-chat loading reads canonical chat-event metadata.

Key files:

- Desktop conversation store adapter: `desktopConversationStore.ts`,
- backend rehydrate payload builder: `rehydratePayload.js`,
- tool-message reconstruction: `conversationReplayToolMessages.js`,
- backend rehydrate services: `backend/src/api/services/rehydrate_*`.

## Tests

```bash
cd frontend
npm run test:ci -- DesktopTranscriptProjectionRuntimeClient.test.ts TranscriptPendingQueue.test.ts TranscriptPendingFlush.test.ts
npm run test:ci -- DesktopConversationContinuityService.test.ts DesktopConversationStore.test.ts ConversationReplayActions.test.jsx
```

## Change Workflow

- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md)
