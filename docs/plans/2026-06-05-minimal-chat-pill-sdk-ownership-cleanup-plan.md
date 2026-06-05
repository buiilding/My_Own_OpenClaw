---
summary: "Execution plan for cleaning up the minimal chat pill UI around SDK-owned conversation/tool runtime boundaries."
read_when:
  - When implementing or reviewing the minimal chat pill, response overlay, SDK projection forwarding, or Electron surface lease cleanup.
  - When continuing the June 2026 cleanup after a partially-applied minimal chat pill refactor.
title: "Minimal Chat Pill SDK Ownership Cleanup Plan"
---

# Minimal Chat Pill SDK Ownership Cleanup Plan

Date: 2026-06-05

## User Intent

Clean up the Electron UI around the current minimal chat pill without replacing
the pill with a new implementation. The UI should be a simple display/input
host around the public Windie SDK. SDK-owned behavior must not be reinvented in
Electron main or React renderer code.

The minimal pill must remain the always-on-top OS chat surface. It must send
messages, show a typing indicator after send, show a response overlay for the
current turn only, allow dragging, expose a stop action, and avoid blocking user
interaction except during SDK-local pointer-control tool leases. Screenshot
invisibility must be scoped to screenshot tool execution leases.

The main dashboard, settings, models, memory, usage, and search-chat surfaces
should keep their existing behavior while the minimal pill ownership is cleaned
up.

## UI Inventory To Preserve

This cleanup is not a product-scope reduction. It should preserve these existing
surfaces and route ownership clearly:

| Surface/state | Expected outcome |
| --- | --- |
| Current minimal chat pill | Keep current implementation, simplify ownership, move pill-owned files under `features/minimalChatPill/`. |
| Main dashboard | Keep existing behavior and dashboard chat transcript behavior. |
| Settings page | Keep existing behavior. |
| Models page | Keep existing behavior, including model-list/model-id controls. |
| Memory page | Keep existing behavior. |
| Usage page | Keep existing behavior. |
| Search chat section | Keep existing behavior. |

Preserve or leave clear extension points for these controls:

| Control/button | Expected outcome |
| --- | --- |
| STT enable button | Preserve existing behavior if present; do not implement a new STT feature in this cleanup. |
| TTS enable button | Preserve existing pill toggle behavior and keep it clickable during active turns. |
| Model ID dropdowns | Keep dashboard/settings/model selection behavior as-is. |
| Chat pill text input | Keep usable and focusable except during pointer-control leases. |
| Add/files button | Keep usable during active turns; no new attachment redesign. |
| Stop button | Show during active turns and call SDK-backed stop IPC immediately. |
| Camera/screenshot toggle | Preserve existing query screenshot toggle; do not merge it with SDK screenshot-tool capture leases. |

Future additions such as richer STT, TTS, camera, and model controls should fit
this folder/ownership model, but they are not implemented in this plan.

## Current State And Constraints

- The SDK-first path already exists: Electron can use `new WindieClient(...).wakeUp(...)`, `agent.conversation(...)`, SDK `displayRows`, SDK `currentTurn`, and `localToolLifecycle`.
- The current dirty worktree already contains a partially-applied cleanup pass:
  SDK snapshot forwarding, phase-handler lease cleanup, bridge surface-prep
  narrowing, pill stop/interactivity edits, and an incomplete move from
  `ChatBox*` names to `minimalChatPill` paths.
- Unrelated dirty worktree state exists and must be preserved. In particular,
  unrelated changes outside this cleanup must not be staged, reverted, or
  reported as part of this plan.
- `docs/desktop/minimal_chat_pill.md` already describes lease-scoped pointer
  and screenshot policy. `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
  still contains conflicting older language saying active loop phases own
  click-through and content protection. This conflict must be resolved in docs
  as part of the cleanup.

## Grounded SDK Facts To Preserve

Do not re-plan this work as "add the SDK hook" unless these facts are no longer
true in the live code. The current cleanup assumes these SDK-first pieces
already exist:

| Fact | Current proof path |
| --- | --- |
| Public SDK client wake-up exists. | `packages/windie-sdk-js/src/runtime/WindieClient.ts` exposes `WindieClient.wakeUp(...)`. |
| Agent conversation runtime exists. | `packages/windie-sdk-js/src/runtime/WindieAgent.ts` exposes `agent.conversation(...)`. |
| Conversation runtime owns send/stop and projections. | `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` owns `send(...)`, `stop(...)`, event subscription snapshots, `displayRows`, and `currentTurn`. |
| Local tool lifecycle is already an SDK timing hook. | `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` wraps local tool execution with `localToolLifecycle.beforeExecute(call)` and release in `finally`. |
| Electron already has a host adapter for the hook. | `frontend/src/main/tool_surface_lifecycle.cjs` maps `mouse_control`, `scroll_control`, and `screenshot` to Electron surface leases. |
| Electron surface leases already exist. | `frontend/src/main/surface_runtime.cjs` owns `beginPointerControlLease(...)` and `beginScreenshotCaptureLease(...)`. |
| Electron direct SDK startup already exists. | `frontend/src/main/index.cjs` wires `WindieClient` with Electron local tool lifecycle rather than requiring a new desktop wrapper. |

The implementation should verify these paths before editing, because current
line numbers may drift. If one fact has changed, update this plan first.

The older pasted phase "Add SDK Local Tool Lifecycle" is superseded by these
facts. The cleanup work is to delete or narrow old parallel Electron/renderer
policies now that the SDK hook exists, not to add a second hook.

## Architectural Change

The source of truth changes to this shape:

- SDK runtime owns wake-up, backend websocket/session, sidecar/local runtime
  coordination, conversation commands, local tool execution timing, tool result
  return, conversation events, `displayRows`, and `currentTurn`.
- Electron main owns only desktop host behavior: BrowserWindow lifecycle, IPC
  forwarding, always-on-top policy, focus/click-through policy, pointer-control
  leases, screenshot capture leases, and connection/status mapping.
- Renderer owns rendering, user input, drag intent, stop/send button UI, typing
  state display from SDK current-turn projection, and response overlay display
  from SDK current-turn projection.
- Sidecar owns actual local authority: mouse, scroll, screenshot, filesystem,
  shell, browser, and system execution.

No React code should own tool execution, screenshot timing, backend websocket
state, or SDK projection reconstruction. No Electron bridge should duplicate
SDK local tool lifecycle timing.

## Conceptual SDK-First Code Shape

The implementation should converge on this conceptual shape. This section is
not exact drop-in code; it is the source-of-truth ownership pattern the code
should follow.

Electron main creates one SDK client/agent/runtime and forwards SDK projections:

```js
import { WindieClient } from '@windie/sdk';
import { createElectronToolSurfaceLifecycle } from './tool_surface_lifecycle.cjs';

let client = null;
let agent = null;
let runtime = null;
let detachRuntimeEvents = null;

async function startWindieRuntime({
  installAuth,
  workspacePath,
  conversationRef,
  store,
  surfaceRuntime,
}) {
  client = new WindieClient({
    appName: 'WindieOS',
    localToolLifecycle: createElectronToolSurfaceLifecycle(surfaceRuntime),

    onBackendOpen(event) {
      broadcastConnectionStatus(true, event);
    },

    onBackendClose(event) {
      broadcastConnectionStatus(false, event);
    },

    onBackendFallback(endpoint) {
      setActiveBackendEndpoint(endpoint);
    },

    onBackendSend(type) {
      noteBackendTraffic(`send:${type}`);
    },
  });

  agent = await client.wakeUp({
    installAuth,
    workspacePath,
    builtins: 'default',
    memory: true,
    persistence: true,
  });

  runtime = agent.conversation({
    conversationRef,
    store,
  });

  attachRuntimeEvents(runtime);
  return { client, agent, runtime };
}

function attachRuntimeEvents(activeRuntime) {
  detachRuntimeEvents?.();
  detachRuntimeEvents = activeRuntime.subscribeEvents((event, snapshot) => {
    broadcastToRenderers('windie:conversation-event', event);
    broadcastToRenderers('windie:rows', snapshot.displayRows);
    broadcastToRenderers('windie:current-turn', snapshot.currentTurn);
  });
}
```

Sending, stopping, and conversation switching stay SDK runtime commands:

```js
async function sendMessage({ text, turnRef, conversationRef, payload }) {
  const activeRuntime = ensureRuntimeForConversation(conversationRef);

  broadcastToRenderers('windie:status', {
    phase: 'running',
    conversationRef,
    turnRef,
  });

  return activeRuntime.send({
    text,
    turnRef,
    payload,
  });
}

async function stopMessage({ conversationRef, turnRef }) {
  const activeRuntime = ensureRuntimeForConversation(conversationRef);
  await activeRuntime.stop(turnRef ?? null);
}

function ensureRuntimeForConversation(conversationRef) {
  if (runtime?.conversationRef === conversationRef) {
    return runtime;
  }

  detachRuntimeEvents?.();
  runtime?.close?.();

  runtime = agent.conversation({
    conversationRef,
    store,
  });

  attachRuntimeEvents(runtime);
  return runtime;
}
```

Electron tool surface policy is only an SDK lifecycle adapter:

```js
function createElectronToolSurfaceLifecycle(surfaceRuntime) {
  return {
    async beforeExecute(call) {
      const toolName = String(call?.toolName || '').trim().toLowerCase();

      if (toolName === 'mouse_control' || toolName === 'scroll_control') {
        return surfaceRuntime.beginPointerControlLease(call);
      }

      if (toolName === 'screenshot') {
        return surfaceRuntime.beginScreenshotCaptureLease(call);
      }

      return undefined;
    },
  };
}
```

Renderer code consumes projections and invokes commands through the preload IPC
boundary. It must not create a local SDK `ConversationRuntime`, tool runner, or
backend websocket adapter just to mirror Electron main:

```ts
type RendererWindieProjection = {
  rows: DisplayRow[];
  currentTurn: CurrentTurnProjection | null;
  status: WindieStatus;
};

function useMinimalChatPillViewModel(): RendererWindieProjection {
  const rows = useChatStore((state) => state.displayRows);
  const currentTurn = useChatStore((state) => state.currentTurnProjection);
  const status = useChatStore((state) => state.status);
  return { rows, currentTurn, status };
}

async function sendFromPill(text: string, payload: Record<string, unknown>) {
  return IpcBridge.invoke(INVOKE_CHANNELS.WINDIE_SEND, {
    text,
    payload,
  });
}

async function stopFromPill(conversationRef: string | null, turnRef?: string) {
  return IpcBridge.invoke(INVOKE_CHANNELS.WINDIE_STOP, {
    conversation_ref: conversationRef,
    turn_ref: turnRef ?? null,
  });
}
```

Forbidden implementation shapes for this plan:

- Renderer creates `new WindieClient(...)`, `agent.conversation(...)`, or a
  throwaway SDK `ConversationRuntime` to send/stop desktop messages.
- Renderer builds live assistant/tool rows from raw backend events instead of
  rendering SDK `currentTurn` and `displayRows` projections.
- Electron main rebuilds SDK projections with `buildDisplayRows([event])` for
  the active runtime subscription.
- Electron main or renderer wraps local tool execution with separate
  screenshot/pointer timing outside `localToolLifecycle.beforeExecute(...)`.
- New adapter layers only rename and forward SDK payloads without enforcing a
  real runtime, security, lifecycle, or test boundary.

## Target Folder Structure

The cleanup should leave the renderer organized like this. This tree is the
source of truth for the folder move; do not infer it from chat history.

```text
frontend/src/renderer/
├── app/
│   ├── MinimalChatPillApp.jsx
│   ├── MinimalResponseOverlayApp.jsx
│   ├── ChatBoxContextLabelApp.jsx
│   ├── ToolGhostDebugApp.jsx
│   ├── App.jsx
│   └── main.jsx
├── features/
│   ├── minimalChatPill/
│   │   ├── components/
│   │   │   ├── MinimalChatPill.jsx
│   │   │   ├── MinimalResponseOverlay.jsx
│   │   │   ├── AttachmentPreviewRow.jsx
│   │   │   └── PillIcons.jsx
│   │   ├── hooks/
│   │   │   ├── useMinimalChatPillBindings.js
│   │   │   ├── useResponseOverlayScrollState.js
│   │   │   ├── useResponseOverlayViewModel.js
│   │   │   └── useResponseOverlayWindowSync.js
│   │   └── utils/
│   │       └── minimalChatPillLayout.js
│   └── chat/
│       ├── components/
│       │   ├── ChatInterface.jsx
│       │   ├── MessageInput.jsx
│       │   ├── MessageList.jsx
│       │   └── other dashboard/chat transcript components
│       ├── hooks/
│       │   ├── useChatComposerDraft.js
│       │   ├── useChatMessageSender.ts
│       │   ├── useChatSurfaceController.js
│       │   ├── useConversationRuntimeProjectionStream.ts
│       │   ├── useCurrentTurnPresentationState.js
│       │   └── other shared chat/dashboard hooks
│       ├── stores/
│       │   └── chatStore.*
│       └── utils/
│           ├── chatPill/
│           ├── chatStream/
│           ├── overlay/
│           ├── state/
│           └── chatSelectors.js
└── styles/
    ├── ChatBox.css
    └── ChatBoxResponseOverlay.css
```

The `minimalChatPill` feature owns the OS pill and the temporary response
overlay renderer. The `chat` feature owns shared chat state, dashboard
transcript UI, SDK projection consumers, message sending, shared overlay
contracts, and shared state helpers. CSS class names may keep `chatbox-*`
temporarily because renaming styles is visual churn and not required for the
ownership cleanup.

## Exact File Move Map

If the file move is performed, use this exact mapping:

| Current path | Target path |
| --- | --- |
| `frontend/src/renderer/app/ChatBoxApp.jsx` | `frontend/src/renderer/app/MinimalChatPillApp.jsx` |
| `frontend/src/renderer/app/ChatBoxResponseApp.jsx` | `frontend/src/renderer/app/MinimalResponseOverlayApp.jsx` |
| `frontend/src/renderer/features/chat/components/ChatBox.jsx` | `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx` |
| `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx` | `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx` |
| `frontend/src/renderer/features/chat/components/chatbox/ChatBoxIcons.jsx` | `frontend/src/renderer/features/minimalChatPill/components/PillIcons.jsx` |
| `frontend/src/renderer/features/chat/components/chatbox/ChatBoxImagePreviewRow.jsx` | `frontend/src/renderer/features/minimalChatPill/components/AttachmentPreviewRow.jsx` |
| `frontend/src/renderer/features/chat/hooks/useChatBoxBindings.js` | `frontend/src/renderer/features/minimalChatPill/hooks/useMinimalChatPillBindings.js` |
| `frontend/src/renderer/features/chat/hooks/useResponseOverlayScrollState.js` | `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayScrollState.js` |
| `frontend/src/renderer/features/chat/hooks/useResponseOverlayViewModel.js` | `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js` |
| `frontend/src/renderer/features/chat/hooks/useResponseOverlayWindowSync.js` | `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js` |
| `frontend/src/renderer/features/chat/utils/chatbox/chatboxPillLayout.js` | `frontend/src/renderer/features/minimalChatPill/utils/minimalChatPillLayout.js` |

After the move, update imports so moved files import shared chat modules through
`../../chat/...` and app/runtime/infrastructure modules through their correct
relative paths. Do not create compatibility re-export files at the old paths
unless a verified dependency cannot be changed in the same patch.

## Route And IPC Naming

Final renderer route names:

```text
?view=minimal-chat-pill       -> MinimalChatPillApp
?view=minimal-response-overlay -> MinimalResponseOverlayApp
?view=chatbox-context-label   -> ChatBoxContextLabelApp
?view=tool-ghost-debug        -> ToolGhostDebugApp
default/no view               -> dashboard App
```

Electron main should load `minimal-chat-pill` for the pill window and
`minimal-response-overlay` for the normal response window. The existing
`tool-ghost-debug` debug route remains separate.

Stable IPC and main-process concepts may keep existing names for this plan:

- `show-chatbox`
- `hide-chatbox`
- `move-chatbox-to`
- `set-chatbox-hit-test-active`
- `set-chatbox-visual-anchor-height`
- `set-responsebox-size`

Those names are transport contracts, not renderer feature ownership. Renaming
them is out of scope unless a separate IPC compatibility-removal plan is
approved.

## Minimal Pill State Machine

The plan should preserve this state machine:

```text
idle:
  pill visible/clickable/draggable according to normal window policy
  response overlay hidden unless a completed response was intentionally left visible

user sends message:
  renderer sends text through SDK-backed IPC
  renderer clears prior response overlay state for the new turn
  typing indicator appears from SDK currentTurn/local send latch
  send button becomes stop button

current turn receives assistant/tool content:
  response overlay appears above the pill
  overlay displays only current-turn assistant text, tool explanations, search
  source rows, and error rows derived from SDK currentTurn projection

mouse_control or scroll_control local tool executes:
  SDK ToolExecutionCoordinator calls Electron localToolLifecycle.beforeExecute
  Electron begins pointer-control lease
  pill/response/context surfaces become foreground, non-focusable, click-through
  sidecar executes the tool
  release callback restores normal pill hit-test policy in finally

screenshot local tool executes:
  SDK lifecycle begins screenshot-capture lease
  Linux hides visible WindieOS overlay windows for capture
  macOS/Windows enable content protection for capture
  sidecar executes screenshot
  release callback restores prior visibility/protection in finally

turn completes/errors/stops:
  stop button returns to send button
  pill remains clickable/draggable
  response overlay terminal visibility follows existing response overlay policy

next user sends message:
  previous response overlay content is cleared
  new turn starts from typing/awaiting state
```

Active loop phase alone must not make the pill click-through, non-focusable, or
screenshot-invisible. Only the tool leases own those temporary policies.

## Behavior Ownership Matrix

| Scenario | SDK owns | Electron main owns | Renderer owns | Sidecar owns |
| --- | --- | --- | --- | --- |
| User sends text from pill | `ConversationRuntime.send(...)`, turn identity, backend send, normalized events, `displayRows`, `currentTurn` | IPC handler that forwards the command to active runtime and broadcasts status/projections | Input, composer draft, send button, local awaiting display from SDK projection/send latch | Nothing |
| Active stream/tool loop | Backend event normalization through SDK, current-turn projection, display row projection | Broadcasting SDK snapshots and response overlay visibility policy | Rendering current-turn text/tool/status rows and response overlay | Nothing unless a local tool is executing |
| Stop button | `ConversationRuntime.stop(...)` and backend stop command | IPC handler forwarding stop to active runtime | Stop button state and immediate local UI reset | Nothing |
| Conversation switching | `agent.conversation({ conversationRef, store })`, runtime close/detach semantics, current runtime projections | Ensures one active runtime per selected conversation and detaches old subscriptions | Selects conversation and renders incoming SDK rows/current turn | Nothing |
| Backend connection state | Managed backend session callbacks/events | Maps SDK connection/open/close/fallback/send signals to UI status and endpoint diagnostics | Displays connection/status state | Nothing |
| `mouse_control` / `scroll_control` | Calls lifecycle immediately before local execution and release in `finally` | Pointer-control lease: foreground, non-focusable, click-through, restore hit-test policy | No timing ownership; only reports normal hit-test intent/drag | Executes pointer/scroll action |
| `screenshot` | Calls lifecycle immediately before local execution and release in `finally`; owns implicit screenshot ordering | Screenshot lease: Linux hide/restore or macOS/Windows content protection, with settle delay | No capture timing ownership | Executes screenshot |
| New turn after previous response | New turn projection and event sequence | Broadcasts new projection/status | Clears previous response overlay content and renders only current-turn entries | Nothing |

This matrix is the ownership guardrail for implementation. If a change makes a
runtime own a column outside this table, update the plan before proceeding.

## Out Of Scope

- Redesigning the pill UI visuals beyond what is required for stop/interactivity
  correctness.
- Building new STT, TTS, camera, or model-picker UI beyond preserving existing
  controls and leaving extension points clear.
- Reworking dashboard layout, settings pages, models page, memory page, usage
  page, or search-chat behavior unless required to keep existing tests passing.
- Changing backend agent-loop policy, provider behavior, model-visible tool
  schemas, or sidecar tool implementations.
- Renaming stable IPC channels such as `show-chatbox` / `hide-chatbox` unless a
  separate compatibility-removal plan is approved.
- Removing renderer screenshot attachment capture code unless it is proven dead
  after the SDK lease path is complete.

## Exact Cleanup And Deletion Targets

The cleanup should remove or narrow these compatibility leftovers. Verify each
one against live code before editing because some may already be partially
changed in the dirty worktree.

| Target | Intended end state |
| --- | --- |
| Electron runtime event forwarding in `frontend/src/main/ipc.cjs` | Broadcast `snapshot.displayRows`, `snapshot.currentTurn`, and raw normalized event. Do not rebuild rows with `buildDisplayRows([event])` in Electron main. |
| `frontend/src/main/response_overlay_phase_handler.cjs` | Active-loop phase handling owns response overlay visibility and stale-correlation gating only. It does not own loop-wide pill click-through, focusability, screenshot hiding, or content protection. |
| `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs` | Normal sidecar tool execution does not call duplicate `prepareComputerUseSurface(...)` or wrap SDK-executed screenshots with separate hide/show logic. Permission verifier capture can remain temporarily if still needed and documented. |
| `frontend/src/main/main_window_runtime.cjs` and `frontend/src/main/local_backend_bridge.cjs` | Do not pass normal computer-use surface prep into the bridge after SDK lifecycle leases own that timing. |
| `frontend/src/main/ipc/ipc_query_send_runtime.cjs` | Do not synthesize and broadcast a local user message that duplicates SDK `ConversationRuntime.send()` emission. Keep payload preparation, conversation-ref resolution, query screenshot preparation if still needed, and active display affinity. Remove `buildLocalUserMessage`, `buildConversationEventFromBackendEvent`, and local user broadcast if still present. |
| `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts` | Do not instantiate throwaway SDK `ConversationRuntime` objects just to send IPC commands. Route send/stop through explicit desktop IPC because Electron main owns the active SDK runtime. |
| `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts` | Store SDK `currentTurnProjection` with minimal stale-turn gating. Do not re-derive assistant/tool/transcript rows from current-turn events. |
| `frontend/src/renderer/features/chat/hooks/useChatStream.ts` | Keep transcript metadata/persistence side effects on normalized `windie:conversation-event`; dashboard transcript should consume `windie:rows`; live pill/overlay should consume `windie:current-turn`. |
| `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts` and related capture-prep modules | Delete or narrow renderer-owned capture/tool surface prep that duplicates SDK/Electron main leases. Keep only code still needed for user-initiated query screenshot attachments until that path is migrated or proven dead. |
| Renderer pill active-loop lock behavior | Running turns do not disable focus, drag, settings, attachment, screenshot toggle, or TTS toggle. Only new send is blocked while a turn is running. |
| Old moved renderer paths | No compatibility re-export files at old `features/chat/components/ChatBox*` or `features/chat/hooks/useResponseOverlay*` paths unless a verified dependency cannot be updated. |
| Stale `WindieAgent.startDesktop` / `WindieDesktopAgent` references | Verify whether runtime code is already deleted. Remove stale docs/tests/examples that still imply Electron has a separate desktop SDK wrapper, unless they describe historical behavior. |

## Files That Must Stay Shared

Do not move these into `features/minimalChatPill/` unless a separate plan
changes shared chat/dashboard ownership:

```text
frontend/src/renderer/features/chat/stores/chatStore.*
frontend/src/renderer/features/chat/hooks/useChatComposerDraft.js
frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts
frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js
frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts
frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js
frontend/src/renderer/features/chat/components/ChatInterface.jsx
frontend/src/renderer/features/chat/components/MessageInput.jsx
frontend/src/renderer/features/chat/components/MessageList.jsx
frontend/src/renderer/features/chat/utils/chatSelectors.js
frontend/src/renderer/features/chat/utils/chatPill/*
frontend/src/renderer/features/chat/utils/chatStream/*
frontend/src/renderer/features/chat/utils/overlay/*
frontend/src/renderer/features/chat/utils/state/*
```

These modules are shared chat/dashboard/projection contracts. The minimal pill
may import them, but it should not become their owner.

## Dirty Worktree Recovery Rules

Implementation starts from a partially-applied worktree, not a clean checkout.
The first implementation step must:

1. Run `git status --short`.
2. Identify files already changed by this plan versus unrelated user changes.
3. Preserve unrelated dirty files exactly as found.
4. Complete or correct the started move/rename rather than creating another
   parallel pill implementation.
5. Avoid destructive cleanup commands such as `git reset --hard`, `git clean`,
   `git restore`, or deleting unexpected files.

Known unrelated dirty paths at plan creation time included:

```text
examples/simple-chat-cli/run.mjs
TASK.md
```

Do not stage, quote sensitive contents from, or report those files as part of
this plan unless the user explicitly changes scope.

## Docs Conflict To Resolve

Before final validation, docs must agree on this ownership rule:

```text
Active loop phase controls response overlay visibility.
SDK local tool lifecycle leases control pointer click-through and screenshot
invisibility/content-protection timing.
```

At plan creation time:

- `docs/desktop/minimal_chat_pill.md` already describes lease-scoped pointer
  and screenshot policy.
- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md` still
  contains older language saying active loop phases own click-through,
  focusability, and content protection.

The implementation must update the overlay workflow doc so it matches the
lease-scoped rule. Do not leave both contracts in docs.

## Route Migration Test Targets

If route names move from `chatbox` / `chatbox-response` to
`minimal-chat-pill` / `minimal-response-overlay`, update at least these tests:

```text
tests/frontend/MainWindowRuntime.test.cjs
tests/frontend/MainWindowOverlayRuntime.test.cjs
tests/frontend/IpcMainBridge.query.test.cjs
tests/frontend/IpcMainBridge.lifecycle.test.cjs
tests/frontend/DesktopSettingsRuntimeClient.test.ts
tests/frontend/AppConfigProvider.models.test.tsx
tests/frontend/AppConfigProvider.storageAndIpc.test.tsx
```

Also search for stale route strings in docs and renderer startup references:

```bash
rg -n "view=chatbox|chatbox-response|ChatBoxApp|ChatBoxResponseApp" frontend/src tests/frontend docs
```

The `chatbox-context-label` route may remain because it is a separate overlay
surface and not part of the minimal pill file move.

## Matching Report File

After approval and before implementation edits continue, create:

```text
docs/plans/2026-06-05-minimal-chat-pill-sdk-ownership-cleanup-report.md
```

The report must link this plan and track:

- checklist status
- success-criteria status
- validation commands and results
- decisions and tradeoffs
- blockers
- deviations from the approved plan
- commits created for this plan

Do not mark the work complete unless every checklist item and success criterion
is complete or explicitly blocked in the report with a concrete reason.

## Ordered Plan

1. Stabilize the current partial worktree into a coherent baseline.
   - Complete the started minimal pill file move or intentionally keep the
     existing names, but do not leave mixed imports, deleted files, or broken
     routes.
   - Preserve unrelated dirty files exactly as found.

2. Make Electron main forward SDK snapshots directly.
   - Ensure runtime subscriptions broadcast `snapshot.displayRows`,
     `snapshot.currentTurn`, and the raw normalized `event`.
   - Remove Electron-side `buildDisplayRows([event])` reconstruction from the
     runtime forwarding path.

3. Move surface timing ownership fully to SDK lifecycle leases.
   - Keep `createElectronToolSurfaceLifecycle(surfaceRuntime)` as the only
     local tool surface policy adapter.
   - Keep pointer-control click-through/focusability scoped to
     `mouse_control` and `scroll_control` leases.
   - Keep screenshot invisibility/content-protection scoped to `screenshot`
     leases.
   - Remove duplicate normal-execution hiding/click-through paths from the local
     backend bridge, while preserving any still-needed permission verifier path
     until it can be routed through the same lease.

4. Stop active-loop phase handling from owning click-through and screenshot
   protection.
   - Response overlay phase handling may own response overlay visibility and
     stale-correlation gating.
   - Active loop phases must not globally make the pill click-through or hidden.

5. Simplify renderer pill command routing and interactivity.
   - Keep the existing minimal pill implementation rather than creating a new
     pill.
   - Allow input focus, drag, settings, attachment, screenshot toggle, and TTS
     toggle while a turn is running.
   - Show a stop button during a running turn and route it to the SDK-backed
     `windie:stop` IPC path.
   - Keep new message submission blocked while a turn is already running unless
     SDK/runtime semantics explicitly support concurrent sends.

6. Clarify folder organization around the current pill.
   - Put pill-owned renderer components, response overlay component, pill
     bindings, response overlay hooks, attachment preview row, icons, and pill
     layout helper under `frontend/src/renderer/features/minimalChatPill/`.
   - Keep shared chat store, transcript, SDK projection consumption, message
     sender, and dashboard chat components under `features/chat/`.
   - Use route names that describe the surface, such as
     `minimal-chat-pill` and `minimal-response-overlay`, only after all imports
     and tests are updated.
   - Do not leave obsolete route aliases unless a verified dependency needs
     them.

7. Update docs to match the new ownership model.
   - Update `docs/desktop/minimal_chat_pill.md`.
   - Update `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
     so it no longer conflicts with lease-scoped policy.
   - Update SDK docs/examples that still show Electron rebuilding rows from a
     single event instead of using SDK snapshots.
   - Update docs/tests/examples that still tell Electron to use
     `WindieAgent.startDesktop(...)` or `WindieDesktopAgent` if those symbols
     are no longer live runtime APIs.
   - Update renderer folder docs if files move.

8. Add or update focused tests.
   - SDK/main projection forwarding tests should verify main broadcasts SDK
     snapshot rows/current-turn.
   - Main phase tests should verify active loop no longer applies global
     click-through/content-protection.
   - Bridge tests should verify normal computer-use execution does not duplicate
     surface prep outside SDK lifecycle leases.
   - Renderer pill tests should verify controls stay interactive during active
     turns and the stop button uses the stop path.
   - Route/folder move tests should be updated to the final route names.
   - If lifecycle internals are touched, SDK tests should verify lifecycle
     before-execute/release on success/failure, bundle steps, and implicit
     post-action screenshots.
   - Renderer projection tests should verify no live assistant/tool row
     materialization from raw `conversation-event`.

9. Create the matching implementation report while executing.
   - Add `docs/plans/2026-06-05-minimal-chat-pill-sdk-ownership-cleanup-report.md`
     after approval and update it as work proceeds.
   - Track checklist status, success criteria, validation results, decisions,
     blockers, deviations, and any commits created for this plan.

## Checklist

- [ ] Worktree is reconciled from the partial stopped pass without touching
      unrelated dirty files.
- [ ] Electron main broadcasts SDK `snapshot.displayRows` and
      `snapshot.currentTurn`.
- [ ] Active-loop phase handling no longer owns pill click-through,
      focusability, or screenshot content protection.
- [ ] Pointer-control and screenshot policies are lease-scoped through SDK
      `localToolLifecycle`.
- [ ] Local backend bridge no longer duplicates normal computer-use surface
      prep outside the SDK lifecycle path.
- [ ] Electron main no longer broadcasts synthetic local user messages when SDK
      `ConversationRuntime.send()` already emits user-turn events.
- [ ] Minimal pill remains draggable and always-on-top.
- [ ] Pill controls remain usable during active turns except during active
      pointer-control leases.
- [ ] Stop button appears during active turns and calls SDK-backed stop IPC.
- [ ] Response overlay clears previous-turn content when a new turn starts and
      renders only current-turn SDK projection content.
- [ ] Renderer live pill/overlay consumes `windie:current-turn`, dashboard rows
      consume `windie:rows`, and transcript side effects consume
      `windie:conversation-event`.
- [ ] Renderer surface orchestration compatibility paths are deleted or
      explicitly scoped to still-needed user-initiated query screenshot capture.
- [ ] Minimal pill files are organized under `features/minimalChatPill/` while
      shared chat/dashboard state remains under `features/chat/`.
- [ ] Stale `startDesktop` / `WindieDesktopAgent` docs/tests/examples are
      removed or updated if they no longer reflect live code.
- [ ] Docs no longer describe conflicting phase-vs-lease ownership.
- [ ] Focused tests cover the changed ownership boundaries.
- [ ] Changelog is updated before commit.
- [ ] Matching report file is updated with validation and commit evidence.

## Success Criteria

- The current minimal pill implementation is preserved and simplified; no new
  replacement pill is introduced.
- Electron main is a host adapter around the SDK conversation runtime, not a
  parallel runtime.
- Renderer displays SDK projections and user controls; it does not execute
  tools, time screenshot visibility, or reconstruct SDK conversation rows.
- The pill is not click-through for an entire agent loop. It is click-through
  only during pointer-control leases and is restored afterward.
- Screenshot protection is applied only around screenshot execution and restored
  afterward.
- Response overlay content is turn-scoped: a new send resets old overlay
  content, then displays backend/SDK current-turn output for the new turn.
- Existing dashboard behavior remains intact.
- Tests and docs describe the same ownership model.

## Validation Commands

Minimum focused validation:

```bash
./bin/docs-list
cd frontend && npm run test:ci -- DesktopLiveTurnRuntimeClient.test.ts ChatBoxOverlayMouseIgnore.test.jsx ChatBoxResponse.state.test.jsx ChatBoxPillLayout.test.js ChatBoxPreviewRemoval.test.js ResponseOverlayPhaseHandler.test.cjs SurfaceRuntime.test.cjs LocalBackendBridgeExtensionRuntime.test.cjs MainWindowRuntime.test.cjs MainWindowOverlayRuntime.test.cjs IpcMainSdkRuntimeBoundary.test.cjs IpcMainBridge.query.test.cjs IpcMainBridge.lifecycle.test.cjs
git diff --check
```

If file moves or route names touch broader renderer startup behavior, also run:

```bash
cd frontend && npm run test:ci -- AppConfigProvider.models.test.tsx AppConfigProvider.storageAndIpc.test.tsx DesktopSettingsRuntimeClient.test.ts
cd frontend && npm run lint
```

If the implementation touches SDK lifecycle internals, also run the relevant SDK
tests for `ToolExecutionCoordinator`, `ConversationRuntime`, and
`WindieClient`.

## Assumptions

- The existing SDK lifecycle hook is the intended final timing boundary for
  local tool surface policy.
- The current `ChatBox`/`ChatBoxResponse` implementation should be moved and
  renamed only as organization cleanup; its behavior should remain recognizable.
- Stable IPC channel names may keep `chatbox` wording in this plan because
  renaming IPC is a wider compatibility-sensitive change.
- The partially-applied cleanup edits were made by Codex in this thread and can
  be completed or corrected within the approved scope, while unrelated user
  changes must be preserved.
- No persisted-data migration is required because the planned changes affect
  runtime ownership, IPC forwarding, routes, docs, and tests, not durable data
  schema.
