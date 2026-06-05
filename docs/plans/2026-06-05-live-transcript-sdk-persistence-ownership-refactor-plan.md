---
summary: "Plan for removing renderer-owned live transcript persistence so SDK conversation runtime is the only durable writer for live chat turns."
read_when:
  - When debugging duplicated chat messages, repeated dashboard conversation rows, or transcript replay bloat after SDK-owned conversation runtime refactors.
  - When changing live chat send, stream completion, tool transcript persistence, dashboard conversation list refresh, or SDK conversation store ownership.
title: "Live Transcript SDK Persistence Ownership Refactor Plan"
---

# Live Transcript SDK Persistence Ownership Refactor Plan

## User Intent

The user saw the Electron dashboard showing repeated chat history entries and
asked what was wrong. The code and local DB inspection found that the live chat
path still has renderer-owned durable transcript writes even though the SDK
runtime now owns conversation send, normalized conversation events,
`displayRows`, `currentTurn`, and local conversation persistence.

The user wants a plan before implementation. The implementation must keep
inspecting until the current code proves the intended architecture:

- Renderer owns display, input, temporary pending UI state, and user intent.
- Renderer must not durably write live SDK conversation events.
- Electron main owns the IPC hop, strict SDK command allowlist, and desktop
  host/window policy.
- Electron main calls public SDK APIs on the live `WindieAgent` /
  `ConversationRuntime`.
- SDK owns conversation event semantics, live turn persistence, replayable
  history, display rows, current turn, send, stop, and tool-event ordering.
- Sidecar owns local storage implementation details such as SQLite tables and
  sidecar RPCs below the SDK store/local-runtime boundary.

The desired result is not just deleting one duplicate call site. The final
implementation must prove there is no remaining live renderer path that writes
the same user, assistant, or tool event that SDK runtime already emits and
persists for the current turn.

## Architectural Change

Current problematic live-turn shape:

```text
Renderer send preparation
  -> record local user transcript entry
  -> conversation.appendEvent
  -> SDK/sidecar store writes projection user_message

Renderer send intent
  -> conversation.send
  -> SDK ConversationRuntime emits and stores canonical user_message

Backend stream completion/tool handlers
  -> renderer records assistant/tool transcript entries
  -> conversation.appendEvent
  -> SDK/sidecar store writes projection assistant/tool rows

SDK runtime
  -> normalizes backend events
  -> applies and stores assistant/tool conversation events
```

Target live-turn shape:

```text
Renderer send preparation
  -> update ephemeral UI/pending state only
  -> conversation.send

SDK ConversationRuntime
  -> emits turn_started
  -> emits and stores canonical user_message
  -> receives backend events
  -> emits and stores assistant/tool/terminal events
  -> produces displayRows and currentTurn

Electron main
  -> forwards SDK snapshots/events to renderer

Renderer
  -> renders SDK projections
  -> may keep temporary pending display state until SDK projection arrives
  -> may request SDK-owned replay/edit/delete/clear commands
  -> does not append durable live conversation events
```

Non-live replay, edit/resend, compaction replay, imported transcript, or repair
flows may still need SDK store mutation APIs. Those APIs must remain clearly
classified as SDK-owned admin/replay operations and must not be used by the
normal live send/stream path to duplicate canonical runtime events.

## Source Of Truth Changes

- Live `chat_events` rows for active SDK turns come from SDK
  `ConversationRuntime.applyEvent(...)`, not renderer transcript helpers.
- `conversation.appendEvent` is not a live renderer transcript persistence API.
  If it remains public through Electron main, it is for classified SDK
  replay/admin/store operations only.
- Dashboard conversation metadata refresh should be driven by SDK store
  invalidation or SDK events, not by renderer-local `transcript-entry-stored`
  events for live turns.
- Renderer chat state may contain pending messages for responsiveness, but
  durable history and replay are loaded from SDK `displayRows` or SDK
  conversation store APIs.
- Sidebar conversation rows should reflect one conversation per
  `conversationRef` with canonical metadata. It should not amplify duplicate
  projection rows, empty stale rows, or renderer-generated transcript writes.

## Runtime Boundaries That Move

- Move live user-message durable persistence out of
  renderer send preparation.
- Move live assistant/tool durable persistence out of renderer stream handlers.
- Keep renderer-side materialization/upsert logic only as display state if
  still required for UX.
- Keep SDK command invokes for user intent (`conversation.send`,
  `conversation.stop`, `conversation.load`, `conversations.list`, etc.), but
  do not use `conversation.appendEvent` from the live renderer path.
- If the SDK lacks a public projection/store invalidation or replay API needed
  after removing renderer persistence, add that SDK API first instead of adding
  a renderer-specific persistence workaround.

## Conceptual Target Code

These snippets are examples of the target architecture, not exact patches. The
implementation must inspect the current code and choose the smallest coherent
changes that make the real code follow this shape.

### Renderer Send Path

Renderer sends user intent and may update ephemeral UI state. It must not write
durable transcript rows for the live turn.

```ts
// Renderer: user intent only.
export async function dispatchPreparedDesktopChatTurn(
  preparedTurn: PreparedDesktopChatTurn,
): Promise<void> {
  applyPendingUserMessageForDisplay({
    id: preparedTurn.turnId,
    conversationRef: preparedTurn.conversationRef,
    text: preparedTurn.text,
    screenshotRef: preparedTurn.screenshotRef,
  });

  await DesktopLiveTurnRuntimeClient.sendQuery({
    text: preparedTurn.text,
    conversationRef: preparedTurn.conversationRef,
    screenshotRef: preparedTurn.screenshotRef,
    screenshotRefs: preparedTurn.screenshotRefs,
    captureMeta: preparedTurn.captureMeta,
    attachmentContext: preparedTurn.attachmentContext,
    attachmentFilenames: preparedTurn.attachmentFilenames,
    workspacePath: preparedTurn.workspacePath,
    model: preparedTurn.model,
    turnRef: preparedTurn.turnRef,
  });
}
```

The live send path should not look like this:

```ts
// Forbidden for normal live SDK turns: this duplicates SDK persistence.
recordUserTranscriptMessage({
  messageId: preparedTurn.turnId,
  text: preparedTurn.text,
  conversationRef: preparedTurn.conversationRef,
  userId: preparedTurn.sessionInfo.userId,
});
```

### Renderer Live Event Handling

Renderer may materialize or upsert visible chat rows, but it should not append
durable events for SDK-normalized live events.

```ts
// Renderer: display-only response handling.
function handleAssistantMessageFull(event: ConversationEvent): void {
  const visibleMessage = buildMaterializedCurrentTurnMessage({
    conversationRef: event.conversationRef,
    turnRef: event.turnRef,
    currentTurnProjection: getCurrentTurnProjection(),
    fallbackText: readAssistantText(event),
  });

  if (visibleMessage) {
    upsertVisibleMessage(visibleMessage);
  }
}
```

The live stream path should not look like this:

```ts
// Forbidden for normal live SDK turns: SDK already owns this event.
recordAssistantTranscriptMessage({
  text: transcriptText,
  messageType: 'llm-text',
  conversationRef: event.conversationRef,
  userId,
  modelContext,
});
```

The same rule applies to live tool events:

```ts
// Renderer: show tool state only.
function handleToolOutput(event: ConversationEvent): void {
  upsertVisibleToolOutput({
    conversationRef: event.conversationRef,
    turnRef: event.turnRef,
    toolName: event.payload?.toolName,
    output: event.payload?.output,
  });
}
```

```ts
// Forbidden for normal live SDK turns: tool output persistence belongs to SDK.
recordToolTranscriptMessage({
  text: renderedToolOutput,
  messageType: 'tool-output',
  conversationRef: event.conversationRef,
  userId,
  modelContext,
});
```

### Electron Main SDK Command Routing

Electron main may expose a strict SDK-shaped invoke bridge, but live send must
execute against the live SDK runtime. It should not rebuild or append local
transcript events around the send.

```js
const sdkCommandHandlers = {
  async 'conversation.send'(payload) {
    const runtime = ensureRuntimeForConversation(payload.conversationRef);
    return runtime.send({
      text: payload.text,
      turnRef: payload.turnRef,
      payload: payload.payload,
    });
  },

  async 'conversation.stop'(payload) {
    const runtime = ensureRuntimeForConversation(payload.conversationRef);
    return runtime.stop(payload.turnRef ?? null);
  },
};

ipcMain.handle('windie:invoke', async (_event, input) => {
  const command = normalizeSdkCommandName(input?.command);
  const handler = sdkCommandHandlers[command];
  if (!handler) {
    throw new Error(`Unsupported Windie SDK command: ${command}`);
  }
  return handler(input?.payload ?? {});
});
```

### SDK Runtime Persistence

The SDK runtime is the canonical live event writer. Renderer display state
should converge from these SDK events and projections.

```ts
export class ConversationRuntime {
  async send(input: ConversationSendInput): Promise<ConversationSendResult> {
    const turnRef = input.turnRef ?? createTurnRef();

    await this.applyEvent(createConversationEvent({
      type: 'turn_started',
      conversationRef: this.conversationRef,
      turnRef,
      source: 'sdk',
      payload: {},
    }));

    await this.applyEvent(createConversationEvent({
      type: 'user_message',
      conversationRef: this.conversationRef,
      turnRef,
      source: 'ui',
      payload: {
        ...input.payload,
        text: input.text,
      },
    }));

    return this.transport.sendQuery({
      ...input.payload,
      text: input.text,
      conversation_ref: this.conversationRef,
    }, {
      messageId: turnRef,
    });
  }
}
```

### Classified Non-Live Store Mutation

If `conversation.appendEvent` remains, it should be used only by explicitly
classified non-live operations such as replay repair, import, or admin tools.
The caller should make that role visible in naming or comments.

```ts
// Allowed only for classified non-live replay/admin flows.
await DesktopConversationAdminRuntimeClient.appendImportedConversationEvent({
  conversationRef,
  event,
  reason: 'imported-transcript-repair',
});
```

It should not be reachable from ordinary send, current-turn event handling, or
minimal chat pill response rendering.

## Out Of Scope

- Redesigning the chat UI visual layout.
- Changing backend provider routing, prompt policy, model selection, or tool
  schema projection.
- Rewriting sidecar SQLite schema unless inspection proves duplicate rows
  require a migration or cleanup utility.
- Deleting valid historical user data automatically.
- Changing platform screenshot, click-through, or pointer-control leases.
- Solving all no-workspace path-resolution behavior. This plan may document
  the `NO WORKSPACE` relative-path problem, but implementation should focus on
  duplicate live transcript persistence unless the user explicitly widens
  scope.

## Grounded Findings From Plan Creation

Plan creation inspection ran:

```bash
./bin/docs-list
git log --oneline -8 -- frontend/src/renderer/app/runtime frontend/src/renderer/infrastructure/transcript frontend/src/main/ipc.cjs packages/windie-sdk-js/src/runtime packages/windie-sdk-js/src/stores docs/plans
rg -n "recordTranscriptUserMessage|recordUserTranscriptMessage|recordAssistantTranscriptMessage|recordToolTranscriptMessage|appendTranscriptProjectionEntry|conversation.appendEvent|transcript-entry-stored|DesktopTranscriptProjectionRuntimeClient|storeTranscriptEntry" frontend/src/renderer frontend/src/main packages/windie-sdk-js/src tests/frontend tests/sdk
```

Observed current paths to inspect during implementation:

- `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
  sets `recordTranscriptUserMessage: true` and calls
  `recordUserTranscriptMessage(...)` before `conversation.send`.
- `frontend/src/renderer/features/chat/utils/messageSender/userTranscriptPersistence.ts`
  records user transcript entries through
  `DesktopTranscriptProjectionRuntimeClient.recordUserMessage(...)`.
- `frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient.ts`
  persists immediate user, assistant, and tool entries, dispatches
  `transcript-entry-stored`, and queues failed writes for retry.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
  records assistant transcript entries on completion.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
  records error assistant transcript entries.
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
  and `frontend/src/renderer/features/chat/utils/toolOutputTranscriptPersistence.ts`
  record tool transcript entries.
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
  converts projection entries to conversation events and invokes
  `conversation.appendEvent`.
- `frontend/src/main/ipc.cjs` exposes `conversation.appendEvent` and maps it to
  `agent.appendConversationEvent(...)`.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` already emits and
  applies canonical `turn_started` and `user_message` events during
  `runtime.send(...)`.
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
  listens for `transcript-entry-stored` to reload sidebar metadata.

Local DB inspection before this plan found the latest conversation storing each
user prompt twice:

```text
projection-... user_message "hey"              turn_ref=""
sdk-evt-...   user_message "hey"              turn_ref="<real turn>"
projection-... user_message "how are you..."  turn_ref=""
sdk-evt-...   user_message "how are you..."  turn_ref="<real turn>"
```

Assistant final messages also appeared twice: once as SDK/backend normalized
events with a real `turn_ref`, and once as renderer projection rows with no
`turn_ref`.

The same screenshot also showed `NO WORKSPACE`, which explains why relative
`read_file docs/docs.json` resolved from the OS home directory. That is a
separate product/path-resolution issue and should not distract from the live
transcript persistence ownership bug unless the user expands the task.

## Ordered Plan

1. Re-orient before coding.
   - Rerun `./bin/docs-list`.
   - Read this plan from top to bottom.
   - Read or reread:
     - `docs/architecture/storage_persistence_change_workflow.md`
     - `docs/architecture/frontend_architecture.md`
     - `docs/desktop/minimal_chat_pill.md`
     - `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
   - Inspect recent commits for touched files and the current SDK ownership
     direction.

2. Create the matching report before implementation.
   - Add
     `docs/plans/2026-06-05-live-transcript-sdk-persistence-ownership-refactor-report.md`.
   - Link back to this plan.
   - Copy the checklist and success criteria.
   - Record every inspection command, validation command, decision, deviation,
     blocker, and commit.

3. Reproduce and quantify the duplicate persistence.
   - Inspect local DB shape if available:
     `chat_events`, `chat_conversation_revisions`, and `conversation_titles`.
   - Query the newest conversation for `user_message`, `assistant_message`,
     `tool_call`, `tool_output`, and `turn_started` rows ordered by timestamp.
   - Record whether duplicates come from projection event ids,
     missing `turn_ref`, renderer generated ids, SDK event ids, or backend
     normalized ids.
   - Do not rely on prior chat history as proof. Reproduce from current code or
     current storage.

4. Classify every renderer transcript write path.
   - Search for:
     - `recordUserTranscriptMessage`
     - `recordAssistantTranscriptMessage`
     - `recordToolTranscriptMessage`
     - `DesktopTranscriptProjectionRuntimeClient`
     - `appendTranscriptProjectionEntry`
     - `storeTranscriptEntry`
     - `conversation.appendEvent`
     - `transcript-entry-stored`
   - For every hit, classify it as:
     - live SDK turn path to delete/migrate,
     - display-only state to preserve,
     - replay/edit/resend/compaction/admin store operation to preserve behind
       SDK APIs,
     - obsolete helper/test to delete,
     - or out-of-scope host behavior.
   - Update the report with the classification before editing.

5. Remove live user-message durable writes from renderer send.
   - The live send path should call `conversation.send` and update pending UI
     only.
   - Delete or disable `recordTranscriptUserMessage` for normal live sends.
   - Keep temporary pending display state if needed until SDK
     `windie:conversation-event` / `windie:rows` arrives.
   - Ensure SDK `ConversationRuntime.send(...)` remains the only canonical
     live `user_message` writer.

6. Remove live assistant/tool durable writes from renderer stream handlers.
   - Stream handlers may still materialize visible rows in the local chat store
     if required for display, but they must not append durable SDK store events
     for live SDK events.
   - Delete or narrow renderer calls to
     `recordAssistantTranscriptMessage(...)` and
     `recordToolTranscriptMessage(...)` in live event handlers.
   - Verify SDK normalized events/store projections already preserve the
     needed assistant/tool rows.
   - If SDK projections are missing a needed row type, add the SDK projection
     support first.

7. Reclassify `DesktopTranscriptProjectionRuntimeClient`.
   - Decide whether it remains for non-live replay/import/compaction/edit
     operations, or whether parts can be deleted.
   - If preserved, rename or document its narrow role so future code does not
     treat it as the live transcript writer.
   - Remove retry queues/events that only existed for live renderer
     persistence, unless another classified non-live flow still needs them.

8. Update dashboard metadata refresh.
   - Remove dependence on renderer-local `transcript-entry-stored` for live
     turn metadata refresh if that event disappears.
   - Prefer SDK store invalidation, SDK conversation events, or explicit
     `conversations.list` reload after SDK-owned events.
   - Ensure the sidebar does not list duplicate rows for the same
     `conversation_id`.
   - Inspect whether zero-event or title-only stale conversations should be
     filtered. If this requires a product decision or migration, record it as
     explicit debt instead of silently deleting data.

9. Add or update tests.
   - Add focused tests proving live send does not call renderer transcript
     persistence.
   - Add tests proving assistant/tool live stream handlers do not append
     durable projection events.
   - Add SDK tests, if needed, proving `ConversationRuntime.send(...)` persists
     one canonical `user_message` for a turn.
   - Add dashboard tests for metadata reload/dedupe behavior if dashboard
     refresh changes.
   - Update boundary tests that currently expect
     `recordTranscriptUserMessage: true` or live
     `DesktopTranscriptProjectionRuntimeClient` usage.

10. Update docs and changelog.
    - Update `docs/architecture/frontend_architecture.md` if it still states
      live chat hooks persist transcript rows.
    - Update `docs/desktop/minimal_chat_pill.md` only if visible minimal pill
      state behavior changes.
    - Update `CHANGELOG.md` with previous behavior and current behavior.

11. Reread and re-search until no in-scope violations remain.
    - After each implementation slice, rerun the transcript-write search.
    - Reopen every remaining hit and reclassify it in the report.
    - If a remaining hit is intentional, the report must name why it is not a
      live duplicate writer.
    - Do not stop after the first fix. Stop only when inspection finds no
      remaining live renderer durable write path for SDK-owned user,
      assistant, or tool events.

12. Validate and commit.
    - Run the validation commands below.
    - Run `git diff --check`.
    - Commit with a conventional commit message and required body.
    - Record the commit hash and validation results in the report.

## Checklist

- [ ] Report file created and linked to this plan.
- [ ] Current duplicate persistence reproduced or disproven from current code
      and storage.
- [ ] All renderer transcript write paths searched and classified.
- [ ] Live send path no longer durably records renderer user transcript
      entries.
- [ ] Live assistant completion/error path no longer durably records renderer
      assistant transcript entries.
- [ ] Live tool-call/tool-output path no longer durably records renderer tool
      transcript entries.
- [ ] `DesktopTranscriptProjectionRuntimeClient` retained only for a justified
      non-live SDK/replay/admin role, or deleted if obsolete.
- [ ] Dashboard conversation metadata refresh updated to use SDK-owned signals
      or explicitly justified remaining behavior.
- [ ] Tests updated for the new ownership boundary.
- [ ] Docs updated.
- [ ] `CHANGELOG.md` updated.
- [ ] Final reread/search confirms no live renderer durable transcript writer
      remains for SDK-owned current turns.
- [ ] Validation commands run and recorded in the report.
- [ ] Commit created and recorded in the report.

## Success Criteria

- Sending one live message produces one canonical durable `user_message` event
  for that turn, with the SDK turn reference.
- Assistant final output for a live turn is not duplicated by renderer
  projection persistence.
- Tool calls and tool outputs for live turns are not duplicated by renderer
  projection persistence.
- Renderer can still show responsive pending input/typing state before SDK
  projection arrives.
- Dashboard/sidebar conversation list still refreshes after new messages and
  does not amplify duplicate rows for the same conversation.
- Replay, edit/resend, compaction, and conversation admin flows still work or
  are explicitly blocked with a concrete reason in the report.
- No renderer feature code treats `chat_events`,
  `chat_conversation_revisions`, sidecar chat RPC names, or
  `conversation.appendEvent` as normal live transcript APIs.
- The report contains a final inventory of remaining transcript persistence
  symbols and explains why each remaining one is intentional or out of scope.

## Validation Commands

Run the relevant focused commands first, then broaden only as needed:

```bash
./bin/docs-list

rg -n "recordTranscriptUserMessage|recordUserTranscriptMessage|recordAssistantTranscriptMessage|recordToolTranscriptMessage|appendTranscriptProjectionEntry|conversation.appendEvent|transcript-entry-stored|DesktopTranscriptProjectionRuntimeClient|storeTranscriptEntry" frontend/src/renderer frontend/src/main packages/windie-sdk-js/src tests/frontend tests/sdk

cd frontend && npm run test -- --runTestsByPath \
  ../tests/frontend/ChatMessageSender.test.tsx \
  ../tests/frontend/RendererChatRuntimeBoundary.test.ts \
  ../tests/frontend/DesktopTranscriptProjectionRuntimeClient.test.ts \
  ../tests/frontend/DesktopConversationStore.test.ts \
  ../tests/frontend/ChatStreamToolHandlers.test.ts \
  ../tests/frontend/ChatStreamThinkingStatus.test.ts

cd packages/windie-sdk-js && npm run test -- --runTestsByPath \
  ../../tests/sdk/WindieSdkConversationRuntime.test.ts \
  ../../tests/sdk/WindieSdkFileConversationStore.test.ts

cd frontend && npm run typecheck
cd packages/windie-sdk-js && npm run build
git diff --check
```

If a listed test path or package script does not exist in the current checkout,
record the exact failure in the report and run the closest focused replacement.

Manual/local DB validation is recommended when a local sidecar DB exists:

```bash
sqlite3 "$HOME/Library/Application Support/desktop-assistant/memory/episodic.db" \
  "SELECT conversation_id, event_type, role, content, turn_ref, timestamp
   FROM chat_events
   WHERE conversation_id = '<test-conversation-ref>'
   ORDER BY timestamp;"
```

## Assumptions

- The SDK runtime already emits and persists canonical live conversation events
  for `runtime.send(...)` and backend normalized events.
- Renderer pending display state can be preserved without writing durable
  transcript rows.
- Existing `conversation.appendEvent` may still be needed for replay/admin
  operations, but should not be used by normal live send/stream rendering.
- Existing stored duplicate rows should not be deleted automatically during this
  refactor unless the user explicitly requests data cleanup or migration.
- The `NO WORKSPACE` relative path issue is separate and should be handled by a
  follow-up plan if the user wants workspace inference or cwd propagation
  changes.

## Approval Gate

Do not implement this plan until the user reads and approves it. If the user
changes the target architecture, update this plan file first, then ask for
approval again.
