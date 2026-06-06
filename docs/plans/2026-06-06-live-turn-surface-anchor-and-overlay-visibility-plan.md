# Live Turn Surface Anchor and Overlay Visibility Plan

Date: 2026-06-06

## User Intent

Fix the current dashboard typing-state regression and response-overlay visibility
edge cases by making SDK live-turn presentation the single owner of visible turn
intent, while keeping Electron main responsible only for native BrowserWindow
policy.

The requested direction is:

- SDK owns which active turn/user row is awaiting assistant output.
- Dashboard renders the awaiting dot from SDK-provided anchor data instead of
  inferring it locally.
- SDK/current-turn presentation owns whether response overlay content or
  awaiting shell should be visible.
- Renderer converts SDK presentation into native response-window visibility and
  size requests.
- Electron main applies native window show/hide/size/click-through/content
  protection policy, but does not independently decide response content
  visibility from phase.

## Current Problem

The live UI currently has two partially competing sources for one user-visible
turn state:

1. SDK `currentTurnProjection.presentation` owns `typingVisible`,
   `overlayVisible`, `entries`, busy/terminal flags, and response content.
2. Electron main overlay phase handling owns native response-window visibility
   from `awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`,
   `complete`, and `idle`.

This creates two failure classes:

- Dashboard awaiting state disappears because the SDK presentation adapter in
  renderer exposes `typingVisible` but not the user-message row anchor needed by
  `MessageList`.
- Response overlay can have SDK-visible streaming content while the native
  response window is not shown or not sized because phase/window visibility and
  renderer content state are not one causal transition.

## Owning Runtime Decision

| Concern | Owner after this plan | Reason |
| --- | --- | --- |
| Active live turn identity | SDK runtime | It already owns conversation turns, display rows, replay, current-turn projection, and SDK customers outside Electron. |
| Awaiting dot row anchor | SDK projection | The anchor is semantic turn/display-row identity, not visual styling. |
| Dashboard dot rendering | Renderer dashboard | The dashboard decides where/how the dot appears once SDK gives the row anchor. |
| Response content visibility intent | SDK projection | Same source as assistant text, reasoning, tool entries, busy state, and terminal state. |
| Response native window show/hide/size | Electron main, driven by renderer request | Main owns BrowserWindow policy; renderer owns translating SDK presentation into requested visible frame. |
| Overlay phase events | Electron main diagnostics/stale-correlation/fallback only | Phase remains useful for tracing and early preflight, but must not compete with SDK presentation for content visibility. |
| Tool click-through/screenshot leases | Electron main via SDK local tool lifecycle | Existing contract stays unchanged. |

## Conceptual Contract

### SDK Presentation Shape

Add explicit live-turn anchors to `LiveTurnPresentation`.

Conceptual TypeScript:

```ts
export type LiveTurnAwaitingAnchor = {
  kind: 'user-message';
  rowId: string;
  turnRef: string | null;
  conversationRef: string;
};

export type LiveTurnOverlayIntent = {
  visible: boolean;
  mode: 'hidden' | 'awaiting' | 'response';
  turnRef: string | null;
  conversationRef: string;
  staleGuardRef: string | null;
};

export type LiveTurnPresentation = {
  conversationRef: string;
  turnRef: string | null;
  phase: CurrentTurnProjectionPhase;
  entries: LiveTurnPresentationEntry[];
  hasVisibleContent: boolean;
  typingVisible: boolean;
  overlayVisible: boolean;
  isBusy: boolean;
  isTerminal: boolean;
  lastError: string | null;
  awaitingAnchor: LiveTurnAwaitingAnchor | null;
  overlayIntent: LiveTurnOverlayIntent;
};
```

Rules:

- `awaitingAnchor` is present when the current active turn has a known
  user-message display row and is awaiting visible assistant output.
- `awaitingAnchor` remains tied to the current turn, not simply "latest user
  message in the renderer array."
- `overlayIntent.mode === 'awaiting'` when awaiting shell should be visible.
- `overlayIntent.mode === 'response'` when entries should be visible.
- `overlayIntent.mode === 'hidden'` when no response overlay should be shown.
- `overlayIntent.staleGuardRef` should use `turnRef` first, then a stable
  correlation/request id if needed by future event sources.

### SDK Projection Build

Conceptual implementation:

```ts
function buildLiveTurnPresentation(
  projection: Omit<CurrentTurnProjection, 'presentation'>,
): LiveTurnPresentation {
  const entries = buildPresentationEntries(projection);
  const hasVisibleContent = entries.length > 0;
  const active = isActiveProjectionPhase(projection.phase);
  const awaiting = projection.phase === 'awaiting' && !hasVisibleContent;
  const userRowId = projection.userMessageRowId ?? null;

  return {
    ...baseFields,
    entries,
    hasVisibleContent,
    typingVisible: awaiting,
    overlayVisible: awaiting || hasVisibleContent,
    isBusy: active,
    isTerminal: isTerminalProjectionPhase(projection.phase),
    awaitingAnchor: awaiting && userRowId
      ? {
        kind: 'user-message',
        rowId: userRowId,
        turnRef: projection.turnRef,
        conversationRef: projection.conversationRef,
      }
      : null,
    overlayIntent: {
      visible: awaiting || hasVisibleContent,
      mode: hasVisibleContent ? 'response' : (awaiting ? 'awaiting' : 'hidden'),
      turnRef: projection.turnRef,
      conversationRef: projection.conversationRef,
      staleGuardRef: projection.turnRef ?? null,
    },
  };
}
```

Implementation must inspect the current SDK display-row/projection code before
choosing the exact field name. If `userMessageRowId` is already derivable from
display rows, prefer deriving it there over adding parallel row-id state.

### Dashboard Rendering

Renderer dashboard should consume the SDK anchor directly.

Conceptual React adapter:

```js
function buildSdkCurrentTurnPresentationState(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  const anchor = presentation?.awaitingAnchor;

  return {
    isBusy: presentation?.isBusy === true,
    showAssistantAwaitingDot: presentation?.typingVisible === true,
    awaitingDotTargetMessageId: anchor?.kind === 'user-message'
      ? anchor.rowId
      : null,
    showChatboxAwaitingReply: presentation?.overlayIntent?.mode === 'awaiting',
    showChatboxResponse: presentation?.overlayIntent?.mode === 'response',
    overlayTurnLifecycle: mapOverlayIntentToLifecycle(presentation?.overlayIntent),
  };
}
```

Dashboard must not fall back to "latest user row" when SDK presentation is
available. A fallback may remain only for legacy projections that do not yet
include `awaitingAnchor`.

### Response Overlay Rendering and Window Request

Response overlay renderer should derive the requested native window state from
SDK presentation, not from main phase.

Conceptual renderer hook:

```js
const overlayIntent = currentTurnProjection?.presentation?.overlayIntent;

const isVisible = overlayIntent?.visible === true;
const overlayLayoutMode = overlayIntent?.mode === 'response'
  ? RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE
  : overlayIntent?.mode === 'awaiting'
    ? RESPONSE_OVERLAY_LAYOUT_MODE.AWAITING_TYPING
    : RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN;

useResponseOverlayWindowSync({
  shellRef,
  isVisible,
  overlayLayoutMode,
  responseEntrySignature,
  turnRef: overlayIntent?.turnRef ?? null,
  staleGuardRef: overlayIntent?.staleGuardRef ?? null,
});
```

### Electron Main Native Policy

Main should accept renderer visibility/size requests as the authoritative
response-window display intent for content/awaiting visibility.

Conceptual main request:

```ts
type ResponseboxSizeRequest = {
  visible: boolean;
  width: number;
  height: number;
  compact_hover?: boolean;
  turn_ref?: string | null;
  stale_guard_ref?: string | null;
};
```

Main keeps only native policy:

```js
function handleSetResponseboxSize(request, deps) {
  if (isStaleOverlayRequest(request.stale_guard_ref, deps.getActiveOverlayGuardRef())) {
    return { success: false, reason: 'stale-overlay-request' };
  }

  if (!request.visible) {
    hideResponseWindow();
    return { success: true, visible: false };
  }

  const bounds = resolveResponseWindowBounds(request.width, request.height, request);
  responseWindow.setBounds(bounds, false);
  setResponseOverlayVisibilityState(true);
  showResponseWindowWhenChatVisible();
  return { success: true, visible: true };
}
```

Phase handling can still update trace/stale-correlation state, but should stop
being the path that independently shows the response window during normal SDK
current-turn rendering.

## Out of Scope

- Redesigning the visual style of dashboard messages, minimal pill, or response
  overlay.
- Changing tool execution, sidecar tool schemas, browser automation behavior, or
  screenshot lease semantics.
- Changing backend provider stream event formats unless inspection proves SDK
  cannot derive the anchor from current normalized events/display rows.
- Removing all overlay phase machinery in one step. The goal is to demote it
  from competing visibility source to diagnostics/stale guard/fallback.
- Reworking conversation replay, storage schema, or memory persistence.

## Ordered Workflow

### 1. Recover and inspect current live-turn projection

- Inspect SDK event normalization, display-row projection, current-turn
  projection, and `LiveTurnPresentation`.
- Identify exactly where user-message display row ids are created and where
  `turnRef` is attached.
- Decide whether the SDK can derive `awaitingAnchor.rowId` from existing rows or
  needs one small projection field.
- Inspect recent commits around `36dc1115e`, `47a180ffd`, and `0f3bec959` to
  preserve the SDK-owned direction rather than restoring deleted renderer
  fallbacks.

### 2. Add SDK anchor and overlay intent

- Extend SDK TypeScript types and generated/built CJS output if the package
  expects checked-in compiled files.
- Update current-turn projection builder to emit `awaitingAnchor` and
  `overlayIntent`.
- Add focused SDK tests for:
  - first awaiting turn with user row id
  - reasoning-only current turn
  - tool-only current turn
  - assistant streaming current turn
  - completed current turn
  - consecutive send after completed turn

### 3. Fix dashboard awaiting dot adapter

- Update renderer SDK presentation adapter to use
  `presentation.awaitingAnchor.rowId`.
- Remove or classify any local "latest user row" inference in the SDK-present
  path.
- Keep legacy fallback only for missing SDK presentation fields and cover it
  with a test if retained.
- Add/adjust dashboard tests proving the dot appears beside the intended user
  row while SDK `typingVisible` is true.

### 4. Move response overlay visibility intent to renderer request path

- Update response overlay view model to prefer
  `presentation.overlayIntent.mode`.
- Update response window sync to include `turn_ref` and `stale_guard_ref`.
- Ensure awaiting shell and response content both produce deterministic nonzero
  frame requests.
- Keep response overlay closeability and scroll behavior renderer-owned.

### 5. Demote main phase visibility handling

- Inspect `response_overlay_phase_handler.cjs`,
  `response_overlay_visibility_policy.cjs`, `overlay_responsebox_handler.cjs`,
  and `ipc_overlay_phase_state.cjs`.
- Keep phase changes for:
  - trace logging
  - stop-shortcut phase state if still needed
  - stale correlation/guard state
  - renderer sync on load
  - preflight fallback before SDK current-turn arrives
- Remove or gate the normal active-loop `showResponseWindowWhenChatVisible()`
  call so it no longer competes with renderer SDK intent.
- Preserve `idle`/terminal cleanup only where needed to avoid stale visible
  windows after renderer unmount, error, app close, or missing SDK projection.

### 6. Inspection loop

After each slice:

- Reread SDK projection, dashboard adapter, response overlay view model/window
  sync, and main phase/window handlers.
- Search for remaining response overlay visibility decisions that are based on
  phase rather than SDK overlay intent.
- Classify each remaining phase-based path as:
  - fixed
  - intentionally fallback/diagnostic
  - still in scope
- Repeat until no unclassified competing visibility paths remain.

## Tests and Validation

Focused tests to update or add:

- `tests/frontend/WindieSdkConversationRuntime.test.ts`
- `tests/frontend/ChatInterfaceWiring.test.jsx`
- `tests/frontend/ChatSurfaceController.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/ResponseOverlayViewContract.test.ts`
- `tests/frontend/ResponseOverlayPhaseHandler.test.cjs`
- `tests/frontend/OverlayResponseboxHandler.test.cjs`
- `tests/frontend/IpcResponseOverlayHandlers.test.cjs`

Validation commands:

```bash
bin/windie docs list
bin/windie test frontend -- WindieSdkConversationRuntime.test.ts ChatInterfaceWiring.test.jsx ChatSurfaceController.test.jsx ChatBoxResponse.state.test.jsx ResponseOverlayViewContract.test.ts ResponseOverlayPhaseHandler.test.cjs OverlayResponseboxHandler.test.cjs IpcResponseOverlayHandlers.test.cjs
cd frontend && npm run typecheck
cd frontend && npm run lint
git diff --check
```

Manual smoke check:

```bash
bin/windie start dev
```

Scenarios to observe:

- Send from dashboard; awaiting dot appears beside the sent user row before
  first visible assistant output.
- Send from minimal pill; awaiting shell appears in response overlay.
- Assistant streaming text causes response overlay to appear and resize without
  requiring a competing phase show.
- Reasoning-only and tool-only turns show response overlay content or progress
  without dashboard losing all live feedback.
- Consecutive sends reset awaiting anchor and do not restore stale response
  content.
- Stopping or erroring a turn hides or terminal-restores the response window
  according to SDK presentation and native cleanup policy.

## Success Criteria

- Dashboard awaiting dot is anchored by SDK-provided active turn/user-row
  identity.
- Minimal pill and dashboard consume the same SDK presentation contract for live
  turn state.
- Response overlay renderer derives visible/awaiting/response intent from SDK
  presentation, then requests native window visibility/size from main.
- Electron main no longer independently shows the response overlay during normal
  active-loop phases when SDK/renderer has the authoritative intent.
- Remaining phase-based behavior is documented as diagnostic, stale guard,
  preflight fallback, or cleanup.
- Focused frontend tests cover the previously failing dashboard typing and
  hidden response overlay cases.
- Docs reflect the new owner split.

## Migration and Compatibility Notes

- No persisted storage migration is expected. This changes live projection and
  UI presentation contracts, not durable chat/memory schema.
- SDK presentation shape is a public-ish internal runtime contract used by
  Electron and tests. Additive fields are preferred first.
- Do not remove phase IPC in the first slice; demote it after renderer SDK
  intent is proven.
- If older current-turn projections without `awaitingAnchor` can still appear
  during development reloads, keep a narrow fallback and delete it in a later
  explicit cleanup after proving all producers include the new field.

## Reread Anchors After Compaction

Before resuming implementation, reread:

- This plan.
- Matching report:
  `docs/plans/2026-06-06-live-turn-surface-anchor-and-overlay-visibility-report.md`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `packages/windie-sdk-js/src/conversation/types.ts`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/main/overlay_responsebox_handler.cjs`
- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
- `docs/desktop/response_overlay.md`
- `docs/desktop/minimal_chat_pill.md`

## Approval Checkpoint

Stop after this plan and wait for approval before implementation. The first
implementation slice should be SDK projection contract plus tests, because that
creates the source of truth the dashboard and response overlay can consume.
