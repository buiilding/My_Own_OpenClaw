---
summary: "Renderer transcript and replay guide covering desktop SDK projection runtime writes, pending queues, session identity, local snapshots, replay state, and rehydrate payloads."
read_when:
  - When changing renderer transcript writes, pending flush behavior, conversation replay, local snapshots, or rehydrate payload construction.
  - When debugging visible chat rows that do not persist or replay correctly.
title: "Transcript and Replay"
---

# Transcript and Replay

Renderer transcript state is the source for visible conversation persistence and dashboard replay. It is not the same as backend active model history.

For code changes or debugging, start with [Transcript Replay Change Workflow](transcript_replay_change_workflow.md). That workflow maps transcript writes, pending queues, sidecar transcript storage, dashboard replay/resume, backend rehydrate payloads, tool-row reconstruction, and validation.

## Code Ownership

| Concern | Files |
| --- | --- |
| Transcript projection write API | `frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient.ts` |
| Transcript session facade | `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`, `desktopTranscriptSessionRuntime.ts` |
| Session identity | `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`, `sessionInfoState.ts`, `sessionInfoStorage.ts` |
| Pending queues | `frontend/src/renderer/infrastructure/transcript/pending/*` |
| Entry persistence | `frontend/src/renderer/infrastructure/transcript/transcriptEntryPersistence.ts`, `transcriptRecordWrite.ts` |
| SDK conversation store adapter | `frontend/src/renderer/infrastructure/transcript/ElectronSidecarConversationStore.ts` |
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
- `sessionId`,
- `userId`.

Do not invent a second conversation id in a component. Use the transcript session runtime and existing conversation workspace binding.

## Replay And Rehydrate

SDK projections convert stored conversation events back into chat messages for renderer display. Rehydrate converts those events into backend-compatible state so an active backend session can continue.

SDK-owned conversation state uses a separate sidecar record kind:

- `conversation_event`: normalized SDK event log for runtime/load/rehydrate/display
- compaction replay generations: complete `compaction_applied` events with replacement-history entries

New SDK callers should read display and rehydrate state through SDK projections
over `conversation_event` rows. The desktop runtime no longer writes hidden
replay rows or falls back to legacy transcript rows.

Dashboard recent-chat loading reads canonical `conversation_event` metadata.

Key files:

- Electron sidecar store adapter: `ElectronSidecarConversationStore.ts`,
- backend rehydrate payload builder: `rehydratePayload.js`,
- tool-message reconstruction: `conversationReplayToolMessages.js`,
- backend rehydrate services: `backend/src/api/services/rehydrate_*`.

## Tests

```bash
cd frontend
npm run test:ci -- DesktopTranscriptProjectionRuntimeClient.test.ts TranscriptPendingQueue.test.ts TranscriptPendingFlush.test.ts
npm run test:ci -- ConversationLocalSnapshotLoader.test.ts ConversationReplayActions.test.jsx RehydratePayload.test.js
```

## Change Workflow

- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md)
