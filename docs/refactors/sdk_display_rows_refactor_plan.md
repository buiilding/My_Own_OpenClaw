---
summary: "Refactor plan for making SDK display rows the canonical chat transcript contract consumed by Electron and future UIs."
read_when:
  - When changing SDK display projection, chat transcript rendering, current-turn projection, tool-call/tool-output ordering, or custom UI adapter boundaries.
  - When a dashboard, overlay, CLI, or future frontend should render conversation rows without reimplementing transcript, tool, replay, or projection semantics.
title: "SDK Display Rows Refactor Plan"
---

# SDK Display Rows Refactor Plan

This is a foundational cleanup, not a UI feature pass. The goal is to make the
SDK expose one ordered display row list that any frontend can wrap visually.

Target contract:

```text
SDK receives normalized conversation events
  -> SDK owns ordered display rows
  -> frontend maps each row to a visual component
```

The frontend should not reconstruct active tool rows from `currentTurn`, splice
them into stored transcript rows, dedupe guessed row ids, or transform active
tool calls into explanation rows. Those behaviors are the reason simple backend
event order can render as confusing UI order.

## Current Problem

The current dashboard message list is not a direct SDK display projection.

Current path:

```text
SDK normalized events
  -> currentTurnProjection.toolEvents
  -> renderer converts currentTurnProjection into ChatMessage rows
  -> renderer splices projected rows into stored transcript rows
  -> renderer dedupes duplicate ids
  -> renderer presentation pipeline hides/summarizes/transforms tool rows
  -> MessageList renders
```

Problem surfaces:

- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
  normalizes tool events into `currentTurn.toolEvents`, but it does not yet
  expose a complete UI-ready ordered row stream as the only dashboard contract.
- `frontend/src/renderer/features/chat/utils/state/chatBoxResponseState.js`
  rebuilds active tool/chat messages from `currentTurnProjection`.
- `frontend/src/renderer/features/chat/utils/chatSelectors.js` merges those
  rebuilt rows with renderer message state and then dedupes by id.
- `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js`
  still has policy to hide, summarize, or transform tool rows.

The architecture violation is simple: renderer code owns message-stream
semantics. The SDK should own them.

## Target Ownership

| Surface | Owner | Rule |
| --- | --- | --- |
| normalized conversation events | SDK runtime | Durable client-side event truth. |
| ordered display rows | SDK projection | Canonical UI transcript for Electron, CLI, custom UIs, and tests. |
| active phase/status | SDK projection | May be exposed as metadata, but not used to reconstruct transcript rows in renderer. |
| row persistence | SDK store adapter | Stores events; display rows are projected from events. |
| Electron renderer | UI only | Chooses components, layout, styling, collapsed details, and interactions. |
| MessageList | UI only | Renders rows in the order provided. |
| backend | model loop/history | Emits events and owns provider-facing history, not local UI display shape. |

## Display Row Contract

Keep the contract small and boring. Do not add extension layers or special-case
render helpers in the first pass.

```ts
type SdkDisplayRow =
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: "user";
      type: "user_message";
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: "assistant";
      type: "assistant_message";
      content: string;
      isStreaming?: boolean;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: "assistant";
      type: "tool_call";
      content: Record<string, unknown>;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: "tool";
      type: "tool_output";
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: "assistant";
      type: "reasoning";
      content: string;
      metadata?: SdkDisplayRowMetadata;
    }
  | {
      id: string;
      conversationRef: string;
      turnRef?: string | null;
      index: number;
      role: "system";
      type: "error";
      content: string;
      metadata?: SdkDisplayRowMetadata;
    };
```

Minimum metadata:

```ts
type SdkDisplayRowMetadata = {
  eventId?: string | null;
  source?: string | null;
  toolName?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  bundleId?: string | null;
  screenshotRef?: string | null;
  screenshotUrl?: string | null;
  modelId?: string | null;
  modelProvider?: string | null;
  raw?: Record<string, unknown> | null;
};
```

Rules:

- Row order is append order from SDK normalized events.
- Each visible event creates at most one display row.
- A tool call row and tool output row are independent rows. Do not pair them in
  renderer code.
- Row ids come from SDK event identity and are stable for the same event.
- The renderer may hide details inside a row, but it must not remove, reorder,
  merge, or synthesize active rows.
- Collapsing old tool logs can be a later UI feature over SDK rows, but it must
  be a pure view toggle that never mutates the canonical display row list.

## Refactor Checklist

- [ ] Add SDK display row types and projection builder.

  Issue: SDK projections currently expose display messages and current-turn
  projection shapes, but Electron still rebuilds active chat rows from
  `currentTurnProjection.toolEvents`.

  Implement: add a single SDK projection helper such as
  `buildDisplayRows(events: ConversationEvent[]): SdkDisplayRow[]`. It should
  reduce normalized conversation events in order and emit the simple row
  contract above.

  Delete: no renderer code should need to inspect raw tool payload aliases to
  decide row order or row type after this exists.

  Success criteria: SDK tests prove a sequence of
  `user_message -> tool_call -> tool_output -> tool_call -> tool_output ->
  assistant_message` returns rows in exactly that order.

- [ ] Expose display rows from the SDK conversation snapshot.

  Issue: renderer currently receives `currentTurn` and separate
  `conversation-event` side-effect events, then computes its own dashboard
  message list.

  Implement: make SDK snapshots expose `displayRows` next to existing
  `currentTurn`, `display`, and `rehydrate` state. `currentTurn` remains useful
  for phase/status, but `displayRows` becomes the transcript display contract.

  Delete: do not add a second Electron-only display-row event. Use the SDK
  snapshot already emitted through the desktop runtime.

  Success criteria: a custom UI can render `snapshot.displayRows` without
  importing Electron renderer helpers.

- [ ] Make Electron renderer consume SDK display rows directly.

  Issue: `selectChatInterfaceState(...)` currently calls
  `replaceCurrentTurnMessagesWithProjection(...)`, then `dedupeMessagesById(...)`.
  That means active rows are reconstructed and merged instead of consumed.

  Implement: add a renderer adapter that maps one `SdkDisplayRow` to one
  `ChatMessage` only for visual compatibility with existing `MessageList`.
  The adapter should be a plain field mapper, not a reducer or merge engine.

  Delete: remove dashboard use of `replaceCurrentTurnMessagesWithProjection`
  and `dedupeMessagesById` for active chat rows.

  Success criteria: `MessageList` receives messages in SDK row order, and no
  selector can reorder or drop tool rows.

- [ ] Keep transcript persistence as event storage, not display authority.

  Issue: renderer mixes stored transcript rows with live current-turn rows.
  That creates two sources of visible truth.

  Implement: on load, ask the SDK store/continuity service for display rows.
  During a live turn, consume SDK snapshot display rows. The store keeps
  normalized events; display rows are always a projection.

  Delete: renderer feature code should not parse stored transcript rows to
  decide tool-call/tool-output order.

  Success criteria: opening an old chat and watching a live chat use the same
  display row projection path.

- [ ] Remove active tool reconstruction from `chatBoxResponseState`.

  Issue: `buildCurrentTurnMessagesFromProjection(...)` creates fake message rows
  from `currentTurn.toolEvents`. That duplicates SDK display projection
  responsibility.

  Implement: leave `currentTurn` for response overlay status and stop/phase
  behavior only. If the response overlay needs row content, it should also read
  SDK display rows or a filtered view of them.

  Delete: remove active dashboard transcript dependency on
  `buildCurrentTurnMessagesFromProjection(...)`,
  `replaceCurrentTurnMessagesWithProjection(...)`, and related fake user-marker
  logic.

  Success criteria: searching renderer dashboard code shows no current-turn
  tool-event-to-message reconstruction path.

- [ ] Simplify `messagePresentationPipeline` to visual-only behavior.

  Issue: the presentation pipeline currently owns live-row semantics:
  active-vs-completed detection, tool-output hiding, tool-call transformation,
  explanation summaries, and search-source exceptions.

  Implement: for the foundational pass, render SDK rows directly. Keep only
  simple visual transforms that do not alter active row ordering. If old tool
  log collapsing is kept, it must be disabled for active rows and implemented
  as a pure view toggle over complete SDK rows.

  Delete: remove active tool-call/tool-output hiding, transformation, and
  summary generation from the live dashboard path.

  Success criteria: active `tool_call` and `tool_output` rows cannot be hidden
  by `showToolLogs`, explanation text, or incomplete-assistant heuristics.

- [ ] Keep row rendering dumb.

  Issue: frontend components have accumulated assumptions about source event
  types and row provenance.

  Implement: `MessageRow` or existing `MessageContent` should switch on SDK row
  type or the compatibility-mapped `ChatMessage.type`:

  ```tsx
  if (row.type === "tool_call") return <ToolCallCard row={row} />;
  if (row.type === "tool_output") return <ToolOutputCard row={row} />;
  if (row.type === "user_message") return <UserBubble row={row} />;
  if (row.type === "assistant_message") return <AssistantBubble row={row} />;
  ```

  Delete: renderer components should not understand replay, rehydrate,
  current-turn projection, transcript-store payload shape, or backend raw event
  aliases.

  Success criteria: a future frontend can reuse the SDK row list and build a
  different visual shell without copying Electron chat logic.

- [ ] Move tests to the SDK boundary first.

  Issue: current tests often verify renderer-specific reconstruction behavior,
  so broken architecture can be preserved by tests.

  Implement: add SDK projection tests for row order, ids, role/type/content, tool
  calls, tool outputs, bundle calls, bundle outputs, assistant streaming, errors,
  and reloaded stored events.

  Delete: remove tests that expect active tool rows to be converted into
  explanation rows or merged from current-turn projection into transcript rows.

  Success criteria: if SDK row order is correct, Electron dashboard rendering is
  mostly a component snapshot/prop mapping test.

## Do Not Implement

- Do not add another renderer layer that wraps the current projection merge.
- Do not keep both SDK display rows and renderer-reconstructed active tool rows
  as normal dashboard inputs.
- Do not make special pairing logic for tool calls and outputs in React.
- Do not write edge-case heuristics for missing explanations, busy state, or
  duplicate ids in the foundational pass.
- Do not make `currentTurnProjection` the transcript source of truth.
- Do not preserve old behavior just because a renderer test asserts it.
- Do not change backend provider history or sidecar tool execution in this
  refactor.

## Migration Notes

- This is a breaking internal display contract cleanup. That is acceptable for
  first-party Electron because the old behavior is the bug.
- Existing stored conversations should not need a data migration if the SDK
  store already loads normalized conversation events. If a renderer-only stored
  row lacks normalized event data, handle it at the store adapter boundary by
  converting it once into an SDK event shape.
- `currentTurn` should remain in SDK snapshots for phase/status controls,
  response overlay state, stop-button state, and thinking/status display. It
  should not be used to rebuild transcript rows.
- Tool-log collapse should be reintroduced only after canonical SDK rows are
  stable, and only as a pure visual filter that never changes active row order.

## Validation Commands

- `cd frontend && npm run test:ci -- WindieSdkConversationRuntime.test.ts`
- `cd frontend && npm run test:ci -- ChatSelectors.test.js ChatBoxResponseState.test.js MessagePresentationPipeline.test.js ChatInterfaceWiring.test.jsx`
- `cd frontend && npm run test:ci -- SdkDisplayChatMessageProjection.test.ts ConversationLocalSnapshotLoader.test.ts`
- `cd packages/windie-sdk-js && npm run build`
- `cd frontend && npm run lint`
- `./bin/docs-list`
- `git --no-pager diff --check`

