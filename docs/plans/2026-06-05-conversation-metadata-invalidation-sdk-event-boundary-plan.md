---
summary: "Plan for removing renderer-facing sidecar-event metadata invalidation and replacing it with a Windie/SDK-shaped conversation metadata invalidation event."
read_when:
  - When changing conversation title refresh, dashboard recent-chat metadata invalidation, sidecar runtime event fan-out, or renderer IPC event ownership.
title: "Conversation Metadata Invalidation SDK Event Boundary Plan"
---

# Conversation Metadata Invalidation SDK Event Boundary Plan

## User Intent

The user wants the UI/runtime architecture to keep moving toward one source of
truth per behavior:

- Renderer owns display and user intent only.
- Electron main owns native windows, IPC transport, and strict event/command
  allowlists.
- SDK owns conversation/runtime semantics and public event shapes.
- Sidecar owns local storage/tool implementation details.

The previous memory/history/rehydrate cleanup made those paths use SDK-shaped
commands and projections, but a remaining old path still exists:

```text
sidecar daemon event
  -> Electron main broadcasts generic sidecar-event
  -> renderer DesktopLocalRuntimeEventSource subscribes to sidecar-event
  -> SDK ConversationContinuityService maps conversation-title-updated
  -> dashboard reloads recent conversations
```

That leaks a local sidecar event channel into renderer infrastructure for a
user-facing conversation concept. The clean direction is a typed,
Windie/SDK-shaped metadata invalidation event:

```text
sidecar daemon event
  -> Electron main classifies local runtime metadata event
  -> Electron main broadcasts windie:conversation-metadata-invalidated
  -> renderer dashboard reloads recent conversations through SDK-shaped
     conversations.list
```

## Architectural Change

Current problematic ownership:

| Layer | Current behavior | Problem |
| --- | --- | --- |
| Sidecar | Emits `conversation-title-updated` after local title metadata changes. | Fine as an implementation detail. |
| Electron main | Forwards arbitrary daemon payloads to renderer as `sidecar-event`. | Generic local-runtime event leaks to renderer. |
| Renderer app runtime | `DesktopLocalRuntimeEventSource` listens to `sidecar-event`. | Renderer knows sidecar event channel. |
| SDK continuity service | Maps local sidecar event payloads to `conversation-metadata-invalidated`. | SDK is doing useful normalization, but from the wrong runtime boundary for Electron UI. |
| Dashboard | Reloads recent conversations through SDK-shaped commands. | This part is good and should remain. |

Target ownership:

| Layer | Target behavior |
| --- | --- |
| Sidecar | Still emits local implementation event `conversation-title-updated`. |
| Electron main | Classifies local daemon event and only broadcasts the public UI event `windie:conversation-metadata-invalidated` for conversation metadata invalidation. |
| SDK | Owns the pure normalization helper/type for conversation metadata invalidation, reusable by Electron main and tests. |
| Renderer/preload | Know only `windie:conversation-metadata-invalidated`, not `sidecar-event` or sidecar payload names. |
| Dashboard | Reloads through `conversations.list`; event payload is only an invalidation hint, not a data source. |

This keeps the sidecar event as an internal implementation detail and makes the
renderer consume a product/runtime event.

## Out Of Scope

- Redesigning the dashboard recent-chat UI.
- Changing sidecar title generation logic or title persistence.
- Changing conversation list/search/delete/load SDK commands.
- Changing Memory panel invalidation (`windie:memory-store-changed`) unless
  inspection finds it directly coupled to this path.
- Removing all sidecar daemon event infrastructure from Electron main. The
  target is removing renderer-facing generic `sidecar-event` usage for
  conversation metadata invalidation.
- Changing wakeword, local-backend status, browser status, or other unrelated
  renderer event channels.

## Conceptual Code

The implementation must follow actual repo patterns, but conceptually the path
should look like this.

SDK owns the normalizer and public shape:

```ts
export type ConversationMetadataInvalidationEvent = {
  type: 'conversation-metadata-invalidated';
  reason: 'conversation-title-updated';
  conversationRef?: string | null;
  title?: string | null;
  source?: string | null;
};

export function conversationMetadataInvalidationFromLocalRuntimeEvent(
  event: JsonRecord & { type?: unknown },
): ConversationMetadataInvalidationEvent | null {
  if (event.type !== 'conversation-title-updated') {
    return null;
  }
  return {
    type: 'conversation-metadata-invalidated',
    reason: 'conversation-title-updated',
    conversationRef: readConversationRef(event),
    title: readTitle(event),
    source: readSource(event),
  };
}
```

Electron main classifies before broadcasting:

```js
sidecarDaemonManager.subscribeEvents((payload) => {
  const invalidation =
    conversationMetadataInvalidationFromLocalRuntimeEvent(payload);

  if (invalidation) {
    broadcastToRenderers('windie:conversation-metadata-invalidated', invalidation);
  }

  // Do not broadcast generic sidecar-event to renderer for this user-facing path.
});
```

Preload/shared channel allowlist exposes only the public event:

```json
{
  "ON_CHANNELS": {
    "WINDIE_CONVERSATION_METADATA_INVALIDATED": "windie:conversation-metadata-invalidated"
  }
}
```

Renderer dashboard listens to the public invalidation:

```ts
IpcBridge.on(ON_CHANNELS.WINDIE_CONVERSATION_METADATA_INVALIDATED, () => {
  void loadRecentConversations();
});
```

Renderer does not parse sidecar payloads and does not mutate recent-chat rows
from the event payload. It reloads from the SDK-shaped source:

```ts
const conversations = await invokeWindieCommand('conversations.list', {
  userId,
  limit,
});
```

## Ordered Inspection And Implementation Workflow

This is an inspection loop, not a one-shot edit list. Keep going until a fresh
inspection finds no remaining in-scope renderer-facing `sidecar-event` path.

1. Recover context by reading this plan, the matching report, and current
   `git status`.
2. Inspect current event producers and consumers:
   - sidecar daemon event subscription in Electron main,
   - `local_backend_status_broadcaster.cjs`,
   - `DesktopLocalRuntimeEventSource`,
   - `DesktopConversationContinuityService`,
   - `ConversationContinuityService`,
   - dashboard conversation hooks,
   - preload/shared channel registry,
   - tests that mention `sidecar-event` or `conversation-title-updated`.
3. Classify every `sidecar-event` usage as:
   - in-scope conversation metadata invalidation leak,
   - internal main/sidecar implementation detail,
   - test asserting old rejection or internal behavior,
   - unrelated event family requiring a separate plan.
4. Move the metadata invalidation normalizer into an SDK public/pure helper if
   it is not already reusable outside `ConversationContinuityService`.
5. Update Electron main sidecar event fan-out so it maps
   `conversation-title-updated` to `windie:conversation-metadata-invalidated`
   and broadcasts that public event to renderer windows.
6. Add the new public event channel to shared/preload/renderer channel
   registries.
7. Replace renderer `DesktopLocalRuntimeEventSource` usage for dashboard
   recent-chat refresh with the public event channel.
8. Delete `DesktopLocalRuntimeEventSource` if no in-scope or valid renderer
   use remains.
9. Narrow or delete renderer/preload exposure of `SIDECAR_EVENT` if no renderer
   consumer remains. If other renderer consumers remain, classify them in the
   report and stop only if they are explicitly out of scope with evidence.
10. Update tests:
    - Electron main/broadcaster maps sidecar title event to public Windie event.
    - Renderer dashboard reloads on
      `windie:conversation-metadata-invalidated`.
    - Renderer/shared/preload no longer exposes or consumes `sidecar-event` for
      this path.
    - SDK normalizer test covers payload key variants.
11. Update docs and `CHANGELOG.md`.
12. Run validation and record results in the report.
13. Perform final design inspection:
    - Re-search renderer/shared for `sidecar-event`, `SIDECAR_EVENT`,
      `conversation-title-updated`, and `DesktopLocalRuntimeEventSource`.
    - Re-search main for generic sidecar fan-out and confirm any remaining use
      is internal or explicitly classified.
    - Re-search dashboard hooks for direct sidecar event handling.
    - Confirm recent-chat data still reloads through `conversations.list`.
14. If any in-scope violation remains, implement the next coherent slice and
    repeat from inspection. Stop only when every finding is fixed or explicitly
    blocked in the report with evidence.

## Checklist

- [ ] Matching report created under `docs/plans/`.
- [ ] Current `sidecar-event` producer/consumer path inspected end to end.
- [ ] All `sidecar-event` usages classified.
- [ ] SDK exposes or owns a pure conversation metadata invalidation normalizer.
- [ ] Electron main broadcasts
      `windie:conversation-metadata-invalidated` for sidecar title updates.
- [ ] Renderer dashboard listens to
      `windie:conversation-metadata-invalidated`.
- [ ] Renderer dashboard reloads through `conversations.list`.
- [ ] Renderer no longer subscribes to `sidecar-event` for conversation
      metadata invalidation.
- [ ] `DesktopLocalRuntimeEventSource` deleted if unused.
- [ ] Shared/preload channel registry no longer exposes `SIDECAR_EVENT` if no
      renderer consumer remains.
- [ ] Tests added/updated for main event mapping.
- [ ] Tests added/updated for renderer dashboard reload on public invalidation.
- [ ] Tests added/updated for SDK invalidation normalization.
- [ ] Docs updated.
- [ ] `CHANGELOG.md` updated.
- [ ] Validation commands and results recorded in report.
- [ ] Fresh final inspection finds no remaining in-scope violations.
- [ ] Commit created and recorded in report.

## Success Criteria

- Renderer feature/app code has no dependency on generic `sidecar-event` for
  conversation metadata invalidation.
- Renderer/shared code does not need to know `conversation-title-updated` as a
  sidecar event payload name.
- Electron main is the only Electron layer that sees the raw sidecar daemon
  title event.
- The renderer receives a public event named
  `windie:conversation-metadata-invalidated`.
- Dashboard recent chats still refresh after title generation.
- Recent-chat data continues to come from `conversations.list`, not from event
  payload mutation.
- Tests fail if the renderer reintroduces `sidecar-event` for this path.
- Tests fail if main stops mapping sidecar title updates to the public Windie
  invalidation event.

## Validation Commands

Planned validation:

```bash
./bin/docs-list
cd frontend && npm run test -- --runTestsByPath \
  ../tests/frontend/LocalBackendStatusBroadcaster.test.cjs \
  ../tests/frontend/PreloadIpcChannels.test.cjs \
  ../tests/frontend/ChatGptDashboardShell.test.jsx \
  ../tests/frontend/UseDashboardConversations.test.jsx \
  ../tests/frontend/ConversationContinuityService.test.ts \
  ../tests/frontend/WindieSdkClient.test.ts \
  --watch=false
cd frontend && npm run typecheck
cd packages/windie-sdk-js && npm run build
git diff --check
```

If the implementation only changes Electron/renderer event routing and SDK pure
helpers, sidecar tests may be recorded as skipped with the reason. If sidecar
daemon event emission changes, run focused sidecar tests around title-update
event emission.

## Reread Anchors After Compaction

When resuming after context compaction, read these first before coding:

- This plan.
- The matching report:
  `docs/plans/2026-06-05-conversation-metadata-invalidation-sdk-event-boundary-report.md`
- `docs/architecture/frontend_architecture.md`
- `docs/architecture/runtime_boundary_matrix.md`
- Current `git status --short --branch`

Then inspect live code rather than relying on prior chat:

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_status_broadcaster.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/shared/ipcChannels.json`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/app/runtime/desktopLocalRuntimeEventSource.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/renderer/features/dashboard/hooks/useDashboardConversations.js`
- `packages/windie-sdk-js/src/runtime/ConversationContinuityService.ts`
- Relevant tests under `tests/frontend`

## Assumptions

- The sidecar may continue emitting `conversation-title-updated` internally.
- The event payload is an invalidation hint only; renderer must reload through
  `conversations.list`.
- `windie:memory-store-changed` is a separate already-public invalidation path
  and should not be changed unless inspection finds direct coupling.
- Removing `sidecar-event` from renderer may require updating preload/shared
  channel tests and any test mocks that still advertise the old channel.
