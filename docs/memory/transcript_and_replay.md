---
summary: "Renderer transcript and replay guide covering SDK-backed conversation events, session identity, local snapshots, canonical conversation storage, and rehydrate projections."
read_when:
  - When changing SDK display/rehydrate projections, canonical conversation events, or local snapshots.
  - When debugging visible chat rows that do not persist or replay correctly.
title: "Transcript and Replay"
---

# Transcript and Replay

Renderer transcript rows are visible projections. Canonical client-runtime state is stored in SDK local-runtime `conversation_events` storage, backed by the local-runtime Python SQLite store, and projected for display, dashboard replay, and backend rehydrate. Neither visible rows nor backend active model history are storage truth.

For code changes or debugging, start with [Transcript Replay Change Workflow](transcript_replay_change_workflow.md). That workflow maps SDK store/display projections, local-runtime event storage, dashboard replay/resume, backend rehydrate payloads, tool-row reconstruction, and validation.

## Code Ownership

| Concern | Files |
| --- | --- |
| Conversation continuity and replay commands | `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts` |
| Conversation list/load/delete/search commands | `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js` |
| Transcript session facade | `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`, `frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient.js`, `desktopTranscriptSessionRuntime.ts` |
| Session identity | `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`, `sessionInfoState.ts`, `sessionInfoStorage.ts` |
| SDK conversation store adapter | `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts` |
| SDK display to chat-message projection | `frontend/src/renderer/infrastructure/transcript/sdkDisplayChatMessageProjection.ts` |
| Local snapshots/replay | SDK conversation store/projection and backend rehydrate services |
| Chat replay actions | `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`, `frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js` |
| Dashboard conversation list | `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`, `frontend/src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient.js` |

## Write Flow

Live sends, assistant turns, tool rows, compaction events, and replay rewrites are stored as SDK conversation events through the desktop conversation store factory and local-runtime `conversation_events` storage. Renderer chat handlers project those SDK events for live display; durable replay and dashboard state are rebuilt from the canonical event log.

Transcript session identity includes:

- `conversationRef`,
- `userId`.

Do not invent a second conversation id in a component. Use the transcript session runtime and existing conversation workspace binding.

## Replay And Rehydrate

SDK projections convert stored conversation events back into chat messages for renderer display. Rehydrate converts those events into backend-compatible state so an active backend session can continue.

SDK-owned conversation state uses a dedicated local-runtime chat-event table:

- `conversation_events`: normalized SDK event log for runtime/load/rehydrate/display
- `attachments`: normalized image attachment records extracted from user-message screenshots, screenshot refs/URLs, artifact refs, and tool-output screenshot payloads
- compaction replay generations: complete `compaction_applied` events with replacement-history entries

SDK callers should read display and rehydrate state through SDK projections over
chat events. The desktop runtime does not write hidden replay rows
or fall back to visible transcript rows for runtime truth.

Edit/resend and try-again rewrites cut the canonical local-runtime chat-event log at
the preserved event boundary. The renderer/SDK sends only the cutoff event id,
the new revision id, and one `conversation_rewritten` event; the local runtime deletes
rows after the cutoff and inserts the rewrite marker in one SQLite transaction.
This keeps prior history in SQLite instead of copying a shortened transcript
back through the renderer-to-local-runtime request path.

Live sends use one stable turn/message id across the pending renderer row and
the SDK query turn. Replay matches canonical local-runtime events by event/payload id;
renderer-only transcript IDs are not a replay contract.

After a compact edit/resend or retry cut, the replay dispatch must persist the
replacement user turn before sending the query. Otherwise the next assistant
completion would be stored as an assistant-only conversation. SDK display and
rehydrate projection also suppress orphan empty-chat greeting rows when no user
turn exists, so older corrupted replay rows do not become model or UI history.

Full replacement remains available for projection bootstraps and explicit
conversation rewrites. A failed replacement or cutoff rewrite leaves the
previous transcript intact.

Dashboard recent-chat loading reads canonical chat-event metadata.

Key files:

- Desktop conversation store adapter: `desktopConversationStore.ts`,
- SDK display projection: `sdkDisplayChatMessageProjection.ts`,
- backend rehydrate snapshot projection: `packages/windie-sdk-js/src/projections/conversationProjections.ts`,
- backend rehydrate dispatch: `packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts`,
- tool-message reconstruction and replay payload/turn shaping:
  `desktopConversationReplayRuntime.js`,
- edit/resend and try-again replay row-index selection:
  `desktopConversationReplayRuntime.js`,
- backend rehydrate services: `backend/src/api/services/rehydrate_*`.

## Tests

```bash
<windie> test frontend -- DesktopConversationContinuityService.test.ts DesktopConversationStore.test.ts ConversationRuntimeProjectionStream.test.ts SdkDisplayChatMessageProjection.test.ts
```

## Change Workflow

- [Transcript Replay Change Workflow](transcript_replay_change_workflow.md)
