---
summary: "Implementation report for the SDK display rows refactor."
read_when:
  - When verifying the SDK display rows refactor status.
  - When debugging chat row ordering, tool-call/tool-output display, current-turn projection usage, or renderer transcript ownership.
title: "SDK Display Rows Refactor Report"
---

# SDK Display Rows Refactor Report

Source plan: [SDK Display Rows Refactor Plan](sdk_display_rows_refactor_plan.md)

Status: implementation complete for the current checklist. Focused SDK,
renderer, dashboard, typecheck, lint, docs, SDK build, and diff validation
passed.

## Completed Success Criteria

### 1. SDK display row types and projection builder

Status: complete.

Implementation:

- Added `SdkDisplayRow` and `SdkDisplayRowMetadata` to the SDK conversation
  contract.
- Added `buildDisplayRows(events)` in the SDK projection module.
- The projection reduces normalized conversation events in append order and
  emits one row for each visible user, assistant, reasoning, tool-call,
  tool-output, and error event.
- Tool call and tool output rows are independent rows. The projection does not
  pair, merge, or reorder them.

Previous behavior:

- SDK exposed `display.messages` and `currentTurn`, but there was no small
  canonical ordered display-row list that represented live tool rows directly.
- Electron renderer code still rebuilt active tool rows from
  `currentTurn.toolEvents`.

Current behavior:

- The SDK has a foundational `displayRows` projection helper that future and
  existing UIs can render directly.
- SDK tests assert that
  `user_message -> tool_call -> tool_output -> tool_call -> tool_output ->
  assistant_message` remains in that exact row order.

Validation:

- Passed: `cd frontend && npm run test -- WindieSdkConversationRuntime --runInBand`
  - Result: 1 suite passed, 63 tests passed.

### 2. SDK conversation snapshots expose display rows

Status: complete.

Implementation:

- Added `displayRows` to `ConversationSnapshot`.
- `SdkConversationRuntime` now projects `displayRows` from the same normalized
  event list used for `display`, `rehydrate`, and `currentTurn`.
- Added a runtime test showing a UI can read `snapshot.displayRows` directly
  after `runtime.load()`.

Previous behavior:

- SDK runtime snapshots exposed `display.messages`, `rehydrate`, and
  `currentTurn`, but did not expose the new simple ordered display-row contract.

Current behavior:

- SDK clients can render `snapshot.displayRows` without Electron renderer
  helper imports.

Validation:

- Passed: `cd frontend && npm run test -- WindieSdkConversationRuntime --runInBand`
  - Result: 1 suite passed, 63 tests passed.

### 3. Electron renderer consumes SDK display rows for tool rows

Status: complete.

Implementation:

- Added `buildChatMessagesFromSdkDisplayRows(...)`, a plain adapter from SDK
  display rows to the existing `ChatMessage` visual shape.
- Routed normalized tool-call, tool-bundle-call, tool-output, and
  tool-bundle-output events through `buildDisplayRows([event])` before adding
  live UI rows.
- Removed dashboard selector use of
  `replaceCurrentTurnMessagesWithProjection(...)`.
- Removed dashboard selector dedupe/reorder behavior.
- Removed terminal/completion attempts to splice current-turn projection rows
  into stored renderer messages.

Previous behavior:

- `selectChatInterfaceState(...)` rebuilt dashboard messages from
  `currentTurnProjection`, spliced them after a guessed user anchor, and
  deduped duplicate ids from the end of the list.
- Tool handlers persisted transcript rows but did not append live UI rows from
  the SDK display-row contract.

Current behavior:

- Tool event rows added to the live dashboard are produced by the SDK
  `buildDisplayRows(...)` projection, then wrapped visually by the renderer.
- The dashboard selector returns active workspace messages in store order and
  does not rebuild, dedupe, reorder, or drop tool rows.

Validation:

- Passed: `cd frontend && npm run test -- ChatSelectors ChatStreamToolHandlers SdkDisplayChatMessageProjection --runInBand`
  - Result: 3 suites passed, 16 tests passed.

### 4. Active current-turn reconstruction removed from dashboard path

Status: complete.

Implementation:

- Deleted `replaceCurrentTurnMessagesWithProjection(...)`.
- Left current-turn projection available for response-overlay presentation, but
  removed the helper that spliced current-turn rows into dashboard transcript
  messages.
- Verified source search no longer finds dashboard selector, completion, or
  terminal handlers calling current-turn transcript replacement.

Previous behavior:

- Completion/error paths and the dashboard selector could rewrite visible
  messages from `currentTurnProjection`.

Current behavior:

- Dashboard transcript rows are no longer rebuilt from `currentTurnProjection`.
- Current-turn projection is scoped to status/overlay behavior.

Validation:

- Passed: `cd frontend && npm run test -- ChatBoxResponseState MessagePresentationPipeline ChatSelectors ChatStreamToolHandlers --runInBand`
  - Result: 4 suites passed, 28 tests passed.
- Passed source check: `rg -n "replaceCurrentTurnMessagesWithProjection|dedupeMessagesById" frontend/src/renderer/features/chat tests/frontend`
  - Result: no remaining production or test references.

### 5. Presentation pipeline no longer hides or summarizes tool rows

Status: complete.

Implementation:

- Simplified `buildThreadPresentationMessages(...)` to return messages in the
  received order.
- Removed completed-tool summarization and hide/drop behavior from the
  foundational path.
- Updated tests to assert that tool rows remain visible even when
  `showToolLogs` is false.

Previous behavior:

- The presentation pipeline could hide completed tool outputs, hide raw
  tool-call rows, or replace tool-call explanations with
  `tool-actions-summary` rows.

Current behavior:

- The dashboard presentation pipeline is visual-only for transcript ordering:
  it does not remove, reorder, merge, or synthesize tool rows.

Validation:

- Passed: `cd frontend && npm run test -- ChatBoxResponseState MessagePresentationPipeline ChatSelectors ChatStreamToolHandlers --runInBand`
  - Result: 4 suites passed, 28 tests passed.

### 6. Stored conversations and live rows share the SDK display-row path

Status: complete.

Implementation:

- Added `loadDisplayRows(conversationRef)` to the SDK `ConversationStore`
  contract.
- Implemented `loadDisplayRows(...)` for in-memory, file, and sidecar-backed
  SDK stores.
- Added `ConversationContinuityService.loadDisplayRows(...)`.
- Routed dashboard conversation opening through `loadDisplayRows(...)` plus
  `buildChatMessagesFromSdkDisplayRows(...)`.
- Changed local snapshot parsed-message loading to derive from SDK display rows
  instead of the older display-message projection.

Previous behavior:

- Opening an old chat used `loadForDisplay(...)` and mapped SDK
  `DisplayMessage` rows, while live tool rows used separate active-turn
  renderer behavior.

Current behavior:

- Opening old chats and rendering live tool rows both use SDK display rows as
  the display projection boundary.
- Transcript persistence still stores normalized events; display rows are
  projected from those events on demand.

Validation:

- Passed: `cd frontend && npm run test -- WindieSdkConversationRuntime ConversationContinuityService ConversationLocalSnapshotLoader ChatStreamToolHandlers ChatSelectors SdkDisplayChatMessageProjection --runInBand`
  - Result: 7 suites passed, 97 tests passed.

### 7. Row rendering remains a visual wrapper

Status: complete.

Implementation:

- Kept the renderer row adapter as a direct mapper from one `SdkDisplayRow` to
  one existing `ChatMessage` shape.
- Did not add replay, rehydrate, backend alias, or current-turn interpretation
  to `MessageList` or message content components.
- Preserved existing visual components for rendering `ChatMessage` types.

Previous behavior:

- Tool ordering was partly decided before `MessageList` by selector and
  presentation pipeline reconstruction.

Current behavior:

- Message components receive already-ordered messages and switch only on the
  visual message type.

Validation:

- Passed: `cd frontend && npm run test -- ChatBoxResponseState MessagePresentationPipeline ChatSelectors ChatStreamToolHandlers --runInBand`
  - Result: 4 suites passed, 28 tests passed.

### 8. Tests moved to the SDK/display-row boundary

Status: complete.

Implementation:

- Added SDK tests for ordered `buildDisplayRows(...)` output.
- Added SDK runtime snapshot tests for `snapshot.displayRows`.
- Added store and continuity tests for `loadDisplayRows(...)`.
- Updated renderer tests so they no longer expect dashboard selector
  current-turn reconstruction, dedupe, or hidden-tool summaries.

Previous behavior:

- Renderer tests encoded current-turn projection replacement and completed-tool
  hiding as expected behavior.

Current behavior:

- Tests assert SDK row order, SDK snapshot access, SDK store loading, renderer
  row adaptation, and selector non-interference.

Validation:

- Passed: `cd frontend && npm run test -- WindieSdkConversationRuntime ConversationContinuityService ConversationLocalSnapshotLoader ChatStreamToolHandlers ChatSelectors SdkDisplayChatMessageProjection --runInBand`
  - Result: 7 suites passed, 97 tests passed.

## Final Validation

- Passed: `cd packages/windie-sdk-js && npm run build`
- Passed: `cd frontend && npm run test -- WindieSdkConversationRuntime ConversationContinuityService ConversationLocalSnapshotLoader ChatStreamToolHandlers ChatSelectors SdkDisplayChatMessageProjection ChatBoxResponseState MessagePresentationPipeline ChatInterfaceWiring UseDashboardConversations --runInBand`
  - Result: 11 suites passed, 170 tests passed.
  - Note: `ChatInterfaceWiring` still logs its pre-existing
    `mockIpcListeners` initialization warning.
- Passed: `cd frontend && npm run typecheck`
- Passed: `cd frontend && npm run lint`
- Passed: `./bin/docs-list`
- Passed: `git diff --check`

## Remaining Success Criteria

- None for the current checklist.

## Open Debt

- The response overlay still derives compact overlay entries from
  `currentTurnProjection`. That is intentionally outside dashboard transcript
  ordering and remains status/overlay behavior.
- The legacy `DisplayConversation` projection remains for compatibility with
  existing SDK consumers, but dashboard chat opening now uses `displayRows`.
