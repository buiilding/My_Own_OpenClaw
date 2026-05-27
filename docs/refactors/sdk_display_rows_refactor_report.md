---
summary: "Implementation report for the SDK display rows refactor."
read_when:
  - When verifying the SDK display rows refactor status.
  - When debugging chat row ordering, tool-call/tool-output display, current-turn projection usage, or renderer transcript ownership.
title: "SDK Display Rows Refactor Report"
---

# SDK Display Rows Refactor Report

Source plan: [SDK Display Rows Refactor Plan](sdk_display_rows_refactor_plan.md)

Status: in progress.

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

## Remaining Success Criteria

- Keep transcript persistence as event storage, not display authority.
- Remove active tool reconstruction from `chatBoxResponseState`.
- Simplify `messagePresentationPipeline` to visual-only behavior.
- Keep row rendering dumb.
- Move tests to the SDK boundary first and remove renderer expectations for
  active reconstruction behavior.

## Open Debt

- None recorded yet beyond the remaining planned success criteria.
