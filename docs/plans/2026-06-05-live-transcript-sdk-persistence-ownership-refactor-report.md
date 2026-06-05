---
summary: "Execution report for removing renderer-owned live transcript persistence in favor of SDK-owned live conversation history."
read_when:
  - When continuing or auditing the live transcript SDK persistence ownership refactor.
title: "Live Transcript SDK Persistence Ownership Refactor Report"
---

# Live Transcript SDK Persistence Ownership Refactor Report

Plan: [Live Transcript SDK Persistence Ownership Refactor Plan](./2026-06-05-live-transcript-sdk-persistence-ownership-refactor-plan.md)

## Status

Implementation complete; commit pending.

## Checklist

- [x] Report file created and linked to the plan.
- [x] Current duplicate persistence reproduced or disproven from current code
      and storage.
- [x] All renderer transcript write paths searched and classified.
- [x] Live send path no longer durably records renderer user transcript
      entries.
- [x] Live assistant completion/error path no longer durably records renderer
      assistant transcript entries.
- [x] Live tool-call/tool-output path no longer durably records renderer tool
      transcript entries.
- [x] `DesktopTranscriptProjectionRuntimeClient` retained only for a justified
      non-live SDK/replay/admin role, or deleted if obsolete.
- [x] Dashboard conversation metadata refresh updated to use SDK-owned signals
      or explicitly justified remaining behavior.
- [x] Tests updated for the new ownership boundary.
- [x] Docs updated.
- [x] `CHANGELOG.md` updated.
- [x] Final reread/search confirms no live renderer durable transcript writer
      remains for SDK-owned current turns.
- [x] Validation commands run and recorded in the report.
- [ ] Commit created and recorded in the report.

## Success Criteria

- [x] Sending one live message produces one canonical durable `user_message`
      event for that turn, with the SDK turn reference.
- [x] Assistant final output for a live turn is not duplicated by renderer
      projection persistence.
- [x] Tool calls and tool outputs for live turns are not duplicated by renderer
      projection persistence.
- [x] Renderer can still show responsive pending input/typing state before SDK
      projection arrives.
- [x] Dashboard/sidebar conversation list still refreshes after new messages
      and does not amplify duplicate rows for the same conversation.
- [x] Replay, edit/resend, compaction, and conversation admin flows still work
      or are explicitly blocked with a concrete reason in this report.
- [x] No renderer feature code treats `chat_events`,
      `chat_conversation_revisions`, sidecar chat RPC names, or
      `conversation.appendEvent` as normal live transcript APIs.
- [x] This report contains a final inventory of remaining transcript
      persistence symbols and explains why each remaining one is intentional or
      out of scope.

## Inspection Log

- Ran `./bin/docs-list`: passed.
- Ran `git status --short`: only the plan file was untracked before report
  creation.
- Read the plan, storage persistence workflow, frontend architecture workflow,
  minimal chat pill guide, and overlay phase workflow.
- Read recent commits for renderer runtime, transcript infrastructure, main
  IPC, SDK runtime/store, and docs plans:

```text
c90c14018 refactor(frontend): route conversation history through sdk commands
9a37ea54d docs(plans): add sdk runtime ui boundary plan
21ffaffab docs(plans): record sdk ipc refactor report
2237d8a3e refactor(frontend): retire legacy sdk ipc channels
3b82937a2 refactor(frontend): route live turn through sdk invoke
59f3d230b refactor(frontend): route renderer commands through sdk invoke
d90e28c31 docs(frontend): align minimal pill sdk ownership docs
0f3bec959 fix(frontend-chat): remove synthetic query send projection
```

## Current Duplicate Persistence Evidence

Current-run reproduction queried:

```bash
sqlite3 "$HOME/Library/Application Support/desktop-assistant/memory/episodic.db" \
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name; ..."
```

Tables present:

```text
chat_conversation_revisions
chat_events
conversation_titles
memories
```

Latest conversation evidence:

```text
conv_a8ebf3a0-f464-4735-ba8c-c7bf2d7dce09 | 928 events | 6 user messages | 11 assistant messages
```

The latest conversation stores duplicate live user messages:

```text
projection-... | user_message | user | hey | turn_ref=""
sdk-evt-...   | user_message | user | hey | turn_ref="4e6a11ba-..."

projection-... | user_message | user | how are you doing | turn_ref=""
sdk-evt-...   | user_message | user | how are you doing | turn_ref="6aadd53d-..."
```

It also stores duplicate assistant/tool rows:

```text
...-assistant-message-full | assistant_message | turn_ref="..."
projection-...             | assistant_message | turn_ref=""

...-tool-call              | tool_call          | turn_ref="..."
projection-...             | tool_call          | turn_ref=""

...-tool-output            | tool_output        | turn_ref="..."
projection-...             | tool_output        | turn_ref=""
```

Conclusion: the current live renderer path appends projection events in
addition to SDK runtime canonical events.

## Transcript Write Classification

Searched:

```bash
rg -n "recordTranscriptUserMessage|recordUserTranscriptMessage|recordAssistantTranscriptMessage|recordToolTranscriptMessage|appendTranscriptProjectionEntry|conversation.appendEvent|transcript-entry-stored|DesktopTranscriptProjectionRuntimeClient|storeTranscriptEntry" frontend/src/renderer frontend/src/main packages/windie-sdk-js/src tests/frontend tests/sdk
```

Classification:

- `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
  imports `recordUserTranscriptMessage`, carries `recordTranscriptUserMessage`,
  sets it to `true`, and records the user transcript before
  `DesktopLiveTurnRuntimeClient.sendQuery(...)`. This is an in-scope live SDK
  duplicate writer and must be removed.
- `frontend/src/renderer/features/chat/utils/messageSender/userTranscriptPersistence.ts`
  is the live user transcript wrapper. After removing live callers, inspect
  whether it has any valid non-live callers. Delete if unused.
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
  builds prepared replay turns with `recordTranscriptUserMessage: true`.
  Replay sends still go through `ConversationRuntime.send(...)`, so this is
  also an in-scope live duplicate writer and must be removed.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
  records assistant transcript entries from SDK `turn_completed`. This is an
  in-scope live SDK duplicate writer and must be removed while preserving
  visible row materialization.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
  records assistant error transcript entries from SDK `turn_error`. This is an
  in-scope live SDK duplicate writer and must be removed while preserving
  visible error materialization.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
  records tool-call, tool-bundle, and tool-output transcript entries from SDK
  events. These are in-scope live SDK duplicate writers and must be removed
  while preserving display handling.
- `frontend/src/renderer/features/chat/utils/toolOutputTranscriptPersistence.ts`
  and `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTranscriptPersistence.ts`
  are wrappers for live stream persistence. Delete if unused after live handler
  cleanup.
- `frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient.ts`
  still supports immediate record methods and replay/admin methods. The
  immediate record methods are duplicate live writers if called from normal
  stream/send; the rewrite/load/replace methods remain classified as non-live
  replay/admin store operations.
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
  `appendEvent(...)` and `appendTranscriptProjectionEntry(...)` remain
  classified as SDK-shaped store/admin machinery. They must not be reachable
  from ordinary live send/current-turn handlers after this refactor.
- `frontend/src/main/ipc.cjs` `conversation.appendEvent` remains classified as
  SDK admin/store command support, not a live renderer transcript API.
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
  listens for `transcript-entry-stored`, which is tied to renderer durable
  persistence. This live refresh trigger must be replaced with SDK event or
  metadata invalidation handling.
- Tests expecting `recordTranscriptUserMessage: true` or mocking live
  transcript persistence must be updated to assert the new no-live-write
  boundary.

## Decisions And Tradeoffs

- Removed renderer live user-message persistence from
  `desktopChatSendPreparation.ts` and replay-prepared sends. Pending visible
  user messages remain in Zustand for responsiveness; SDK `conversation.send`
  remains the canonical durable writer.
- Removed renderer live assistant/error persistence from stream completion and
  terminal handlers. Those handlers still materialize visible assistant/error
  messages from SDK `currentTurn`.
- Collapsed live tool stream handlers to display-boundary event classification
  only. Tool cards/progress are displayed from SDK current-turn projections, so
  renderer-side tool transcript formatting was duplicate persistence-only code.
- Deleted obsolete live persistence wrappers:
  `userTranscriptPersistence.ts`, `chatStreamTranscriptPersistence.ts`, and
  `toolOutputTranscriptPersistence.ts`.
- Narrowed `DesktopTranscriptProjectionRuntimeClient` to non-live SDK
  replay/admin operations: compacted replay replacement, transcript rewrite,
  display/rehydrate loads, metadata list, delete, and seeded store creation.
- Replaced dashboard `transcript-entry-stored` refresh with
  `windie:conversation-event` refresh. SDK `user_message` reloads recent chats;
  SDK `assistant_message` keeps the title visibility poll.
- Kept `conversation.appendEvent` in Electron main and
  `desktopConversationStore.ts` for classified SDK store/admin/replay
  operations. It is no longer reachable from normal live send/stream paths.

## Deviations And Blockers

- The plan listed `cd packages/windie-sdk-js && npm run test ...`, but
  `@windie/sdk` does not define a `test` script in this checkout. The matching
  SDK runtime/store tests live under `tests/frontend`, so those were run through
  the frontend Jest config.

## Validation Results

Passed:

```bash
./bin/docs-list
```

Passed:

```bash
cd frontend && npm run typecheck
```

Passed:

```bash
cd frontend && npm run test -- --runTestsByPath \
  ../tests/frontend/ChatMessageSender.test.tsx \
  ../tests/frontend/ConversationReplayActions.test.jsx \
  ../tests/frontend/ChatStreamToolHandlers.test.ts \
  ../tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx \
  ../tests/frontend/DesktopTranscriptProjectionRuntimeClient.test.ts \
  ../tests/frontend/UseDashboardConversations.test.jsx \
  ../tests/frontend/RendererChatRuntimeBoundary.test.ts
```

Result: 7 suites / 87 tests passed.

Passed:

```bash
cd frontend && npm run test -- --runTestsByPath \
  ../tests/frontend/WindieSdkConversationRuntime.test.ts \
  ../tests/frontend/WindieSdkFileConversationStore.test.ts
```

Result: 2 suites / 93 tests passed.

Passed:

```bash
cd packages/windie-sdk-js && npm run build
```

Passed:

```bash
git diff --check
```

Skipped with recorded reason:

```bash
cd packages/windie-sdk-js && npm run test -- --runTestsByPath \
  ../../tests/sdk/WindieSdkConversationRuntime.test.ts \
  ../../tests/sdk/WindieSdkFileConversationStore.test.ts
```

Result: failed because `@windie/sdk` has no `test` script and this checkout has
no `tests/sdk` directory.

Final live renderer inventory:

```bash
rg -n "recordTranscriptUserMessage|recordUserTranscriptMessage|recordAssistantTranscriptMessage|recordToolTranscriptMessage|recordToolOutputTranscriptMessage|chatStreamTranscriptPersistence|toolOutputTranscriptPersistence|userTranscriptPersistence|transcript-entry-stored|recordUserMessage|recordAssistantMessage|recordToolMessage" frontend/src/renderer/features frontend/src/renderer/app/runtime frontend/src/renderer/features/dashboard
```

Result: no matches.

Remaining broader inventory items:

- `frontend/src/renderer/infrastructure/transcript/pending/*` and
  `transcriptEntryPersistence.ts`: lower-level pending/persistence utilities
  retained for replay/admin infrastructure and existing focused utility tests.
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
  and `frontend/src/main/ipc.cjs`: `conversation.appendEvent` retained for SDK
  store/admin/replay operations.
- `tests/frontend/*`: boundary assertions, retained admin/store tests, and
  utility tests.
- Plan/report docs: historical findings and validation commands.

## Commits

Pending.
