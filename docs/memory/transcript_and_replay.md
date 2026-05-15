---
summary: "Renderer transcript and replay guide covering TranscriptWriter, pending queues, session identity, local snapshots, replay state, and rehydrate payloads."
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
| Transcript write API | `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts` |
| Session identity | `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`, `sessionInfoState.ts`, `sessionInfoStorage.ts` |
| Pending queues | `frontend/src/renderer/infrastructure/transcript/pending/*` |
| Entry persistence | `frontend/src/renderer/infrastructure/transcript/transcriptEntryPersistence.ts`, `transcriptRecordWrite.ts` |
| SDK conversation store adapter | `frontend/src/renderer/infrastructure/transcript/ElectronSidecarConversationStore.ts` |
| SDK display to chat-message projection | `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts` |
| Local snapshots/replay | `conversationLocalSnapshotLoader.ts`, `conversationReplayState.ts`, `rehydratePayload.js`, `rehydrateMessageState.js` |
| Chat replay actions | `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js` |
| Dashboard conversation list | `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`, `useTranscriptSessionInfo.js` |

## Write Flow

`TranscriptWriter.ts` records:

- user messages,
- assistant messages,
- tool-call rows,
- tool-output rows,
- transparency payloads,
- structured tool payloads,
- screenshot refs,
- model id/provider metadata.

If session identity is not ready, entries are queued through pending transcript queues and flushed when `sessionRuntime` resolves conversation/user identity.

## Session Identity

Transcript session identity includes:

- `conversationRef`,
- `sessionId`,
- `userId`.

Do not invent a second conversation id in a component. Use the transcript session runtime and existing conversation workspace binding.

## Replay And Rehydrate

Replay converts stored transcript entries back into chat messages for renderer display. Rehydrate converts stored transcript entries into backend-compatible state so an active backend session can continue.

SDK-owned conversation state uses a separate sidecar record kind:

- `conversation_event`: normalized SDK event log for runtime/load/rehydrate
- `transcript`: visible transcript rows
- `transcript_replay`: compacted replay rows

New SDK callers should read display and rehydrate state through SDK projections
over `conversation_event` rows. Existing conversations without event rows still
fall back through the transcript projection adapter.

Dashboard recent-chat loading merges `conversation_event` and `transcript`
metadata so newly SDK-owned chats and old local chats appear together at
startup.

Key files:

- renderer replay state: `conversationReplayState.ts`,
- backend rehydrate payload builder: `rehydratePayload.js`,
- tool-message reconstruction: `conversationReplayToolMessages.js`,
- backend rehydrate services: `backend/src/api/services/rehydrate_*`.

## Tests

```bash
cd frontend
npm run test:ci -- TranscriptWriter.userAssistant.test.ts TranscriptWriter.tool.test.ts TranscriptPendingQueue.test.ts TranscriptPendingFlush.test.ts
npm run test:ci -- ConversationReplayState.test.ts ConversationReplayActions.test.jsx RehydratePayload.test.js
```

## Change Workflow

- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md)
