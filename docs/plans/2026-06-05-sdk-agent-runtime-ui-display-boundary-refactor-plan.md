---
summary: "Compaction-safe refactor plan for making the SDK the agent runtime while Electron main hosts it and renderer/preload only display or invoke user intent."
read_when:
  - When simplifying WindieOS UI runtime ownership around SDK, Electron main, preload, renderer, and sidecar boundaries.
  - When auditing whether renderer/preload still know sidecar IPC names, DB tables, or runtime internals for SDK-owned user-facing concepts.
title: "SDK Agent Runtime UI Display Boundary Refactor Plan"
---

# SDK Agent Runtime UI Display Boundary Refactor Plan

## User Intent

The user wants the UI code to be conceptually simple:

- The SDK is the agent runtime.
- Electron main uses the live SDK runtime and owns only desktop host policy.
- Preload exposes narrow bridges and does not contain business logic.
- Renderer owns display, local UI state, and user intent only.
- Sidecar owns local implementation details such as storage, tools, browser,
  filesystem, memory indexes, and screenshots.
- Backend owns orchestration, provider routing, prompt/model policy, hosted
  APIs, and backend remote tools.

Renderer code should not know sidecar RPC names, local DB tables,
`chat_events`, `chat_conversation_revisions`, legacy `windie:*` runtime
channels, or internal store semantics for user-facing SDK concepts. Renderer
should render SDK projections and call SDK-shaped commands such as
`windie.invoke("conversation.send", payload)`.

This plan is intentionally compaction-safe. It is not a one-time static list of
files to edit. It is a workflow for future agents to reread the current code,
classify every command/runtime path, change the code only where the current
inspection proves it violates the target architecture, and keep inspecting until
no in-scope violations remain.

## Architectural Change

Current risk model:

```text
Renderer feature
  -> renderer runtime/service/helper
  -> generic preload IPC or sidecar-shaped channel
  -> Electron main helper or sidecar RPC
  -> SDK/backend/sidecar behavior, depending on path
```

Target model for SDK-owned concepts:

```text
Renderer feature
  -> display state + user intent only
  -> window.windie.invoke("sdk.command", payload)
  -> preload validates and forwards one SDK-shaped invoke
  -> Electron main strict allowlist
  -> live public SDK API on WindieAgent / ConversationRuntime
  -> SDK store, local runtime, backend transport, and projections
  -> sidecar/backend implementation detail
```

Target model for Electron-native host concepts:

```text
Renderer host UI intent
  -> narrow host bridge command
  -> Electron main BrowserWindow / permission / overlay / workspace policy
```

The refactor must make this distinction obvious in code:

- SDK-owned user-facing concepts use SDK-shaped commands and public SDK APIs.
- Electron-native shell concepts use host commands.
- Sidecar-shaped names live only below SDK local-runtime/store adapters or
  inside Electron main implementation internals, not in renderer feature code.

## Source Of Truth Changes

- Conversation send, stop, replay, edit, retry, rehydrate, compact, load,
  search, delete, and clear semantics are SDK-owned.
- Memory list, delete, clear, and nuke semantics are SDK-owned.
- Display rows and current-turn state are SDK projections.
- Electron main is the live SDK customer and command gatekeeper.
- Renderer feature code is not a transcript, memory, sidecar, backend, or tool
  runtime.
- Preload is not an application API implementation. It is a validation and
  transport boundary.

## Runtime Boundaries That Move

- Any remaining renderer user-facing command path that reaches
  `IpcBridge.invoke(...)` with a sidecar/internal channel must either move to
  `windie.invoke("sdk.command", payload)` or be reclassified as an
  Electron-native host command.
- Any remaining Electron main user-facing command handler that bypasses the SDK
  and calls sidecar/local helpers directly must move behind a public SDK API.
- If the SDK does not expose the needed command, add the SDK API first, backed
  by existing SDK store/local-runtime abstractions.
- Renderer-side adapters that only rename and forward payloads should be
  deleted or collapsed unless they enforce a real display, security, lifecycle,
  or test boundary.
- Generic `window.ipc.invoke(...)` should not be the path for SDK-owned
  concepts. If it must remain for host/native commands during this refactor,
  it must be treated as a transitional host bridge and covered by boundary
  tests.

## Old Paths To Delete Or Preserve

Delete or migrate when inspection proves they are user-facing SDK concepts:

- Renderer calls to sidecar-style chat and memory channels such as
  `clear-chat-history`, `clear-local-memory`, `list-chat-conversations`,
  `search-chat-conversations`, `get-chat-events`,
  `delete-chat-conversation`, `list-episodic-memories`,
  `list-semantic-memories`, `delete-episodic-memory`, and
  `delete-semantic-memory`.
- Renderer knowledge of DB tables such as `chat_events` and
  `chat_conversation_revisions`.
- Renderer-local SDK runtime construction or replay services when Electron main
  can call public SDK runtime APIs.
- Shared/preload channel registry entries that expose SDK-owned runtime
  concepts as direct sidecar/internal IPC.
- Tests that assert renderer access to internal channels instead of SDK-shaped
  commands.

Preserve when classified as Electron-native host behavior:

- Window controls, main/chat/overlay visibility, focus, hit-test, drag, and
  content-protection policy.
- Permission probes and OS permission requests.
- Workspace picker and desktop shell policy.
- Screenshot attachment capture when it is explicitly a renderer/user
  attachment workflow, unless inspection shows the SDK should own the feature.
- Artifact upload/fetch host plumbing until inspection proves it should move to
  public SDK artifact APIs.
- Local backend/wakeword readiness status if it is only host diagnostics and
  not a duplicate agent runtime.

Preserve as internal implementation details only:

- Sidecar RPC names inside SDK local-runtime/store adapters.
- Sidecar storage tests that validate sidecar implementation semantics.
- Electron main sidecar bridge handlers that are only consumed by SDK
  local-runtime/store adapters, not renderer feature code.

## Preliminary Grounded Findings

The plan was created after reading:

- `AGENTS.md`
- `docs/architecture/frontend_architecture.md`
- `docs/architecture/runtime_boundary_matrix.md`
- `docs/sdk/windie_client_runtime.md`
- `docs/sdk/conversation_runtime.md`
- `docs/plans/2026-06-05-continuous-sdk-shaped-ui-runtime-ownership-refactor-plan.md`
- `docs/plans/2026-06-05-continuous-sdk-shaped-ui-runtime-ownership-refactor-report.md`

The plan creation inspection also ran:

```bash
./bin/docs-list
git status --short --branch
git --no-pager log --oneline -n 12 -- frontend/src/renderer frontend/src/main packages/windie-sdk-js docs/plans
rg -n "IpcBridge\\.invoke|INVOKE_CHANNELS|window\\.ipc|invokeWindieCommand|windie:invoke|clear-chat-history|clear-local-memory|delete-chat-conversation|list-chat-conversations|search-chat-conversations|get-chat-events|delete-episodic-memory|delete-semantic-memory|list-episodic-memories|list-semantic-memories|DesktopMemoryRuntimeClient|DesktopConversationLibraryClient|DesktopLiveTurnRuntimeClient|DesktopTranscriptProjectionRuntimeClient|ConversationContinuityService|createConversationRuntime|createDesktopConversationStore|SidecarConversationStore|chat_events|chat_conversation_revisions" frontend/src/renderer frontend/src/preload.js frontend/src/main/ipc.cjs frontend/src/shared/ipcChannels.json packages/windie-sdk-js/src tests/frontend tests/sdk tests/sidecar
```

Starting findings to verify during implementation:

- `frontend/src/preload.js` still exposes generic `window.ipc.invoke(...)` and
  also exposes the SDK-shaped `window.windie.invoke(...)`.
- `frontend/src/shared/ipcChannels.json` and generated renderer channel types
  still include sidecar-shaped memory and chat history invoke names.
- `tests/frontend/PreloadIpcChannels.test.cjs` still includes expectations for
  direct `clear-chat-history` and `clear-local-memory` preload access.
- `frontend/src/renderer/infrastructure/transcript/sdkSidecarConversationStore.ts`
  maps SDK store methods to sidecar-shaped IPC. This is currently an internal
  SDK/local-runtime/store adapter candidate, but the implementation pass must
  verify no renderer feature treats it as a user-facing API.
- Renderer infrastructure still contains transcript/session/projection helpers
  that must be classified as either display-only caches, SDK adapter internals,
  or duplicate runtime behavior.
- Direct renderer `IpcBridge.invoke(...)` remains in host/native paths such as
  window controls, permissions, workspace, local-backend status, browser
  session status, screenshot attachment capture, system-state capture, surface
  orchestration, and artifact upload. These are not automatically violations;
  each must be classified by runtime owner.
- Previous commits already moved live runtime commands to SDK-shaped invoke and
  deleted legacy direct `windie:send`, `windie:stop`, `windie:rehydrate`,
  `windie:compact-history`, `windie:update-settings`, `windie:list-models`, and
  `windie:wakeword-detected` renderer-facing channels.

These findings are not a complete to-do list. A future implementation pass must
rerun searches, inspect call graphs, reread docs after deterministic findings,
and update the report with current findings before editing code.

## Target Folder Organization

The exact moves must be chosen from current code during implementation, but the
target organization should converge toward this conceptual shape:

```text
frontend/src/renderer/
  app/
    sdkCommands/              # renderer user-intent wrappers over window.windie.invoke
      conversationCommands.ts
      memoryCommands.ts
      modelCommands.ts
      settingsCommands.ts
    sdkProjections/           # subscriptions/view models from SDK rows/currentTurn/events
      conversationRows.ts
      currentTurn.ts
      conversationEvents.ts
    hostCommands/             # Electron-native host intents only
      windowCommands.ts
      permissionCommands.ts
      workspaceCommands.ts
      overlayCommands.ts
  features/
    chat/                     # display, input, local UI interaction
    dashboard/                # display, navigation, user intent
  infrastructure/
    ipc/                      # low-level bridge validation; not feature command semantics
    transcript/               # display caches/projection helpers only, not durable source of truth

frontend/src/main/
  sdk_command_runtime.cjs     # strict windie:invoke allowlist to public SDK APIs
  index.cjs                   # create WindieClient, wakeUp, conversation runtime
  *_window_*.cjs              # BrowserWindow and overlay host policy
  local_backend_bridge*.cjs   # sidecar implementation bridge for SDK/main internals

packages/windie-sdk-js/src/
  runtime/                    # public client/agent/conversation APIs and projections
  stores/                     # store interfaces and sidecar/file/in-memory adapters
```

The important rule is not the literal folder names. The important rule is that
feature code should see SDK commands/projections or host commands, not sidecar
RPC names and not duplicate runtime implementations.

## Conceptual Code

Renderer command usage:

```ts
import { invokeWindieCommand } from "../sdkCommands/invokeWindieCommand";

export async function sendConversationMessage(input: {
  conversationRef: string;
  turnRef: string;
  text: string;
  payload?: Record<string, unknown>;
}) {
  await invokeWindieCommand("conversation.send", input);
}

export async function clearAllMemories(userId: string) {
  await invokeWindieCommand("memories.clearAll", { userId });
}
```

Renderer projection usage:

```ts
function MinimalResponseOverlay() {
  const rows = useSdkDisplayRows();
  const currentTurn = useSdkCurrentTurn();

  return (
    <ResponseOverlay
      rows={rows}
      currentTurn={currentTurn}
    />
  );
}
```

Preload SDK bridge:

```js
contextBridge.exposeInMainWorld("windie", {
  invoke(command, payload = {}) {
    if (!isSdkCommandName(command)) {
      return Promise.reject(new Error("Invalid Windie SDK command"));
    }

    return ipcRenderer.invoke("windie:invoke", {
      command,
      payload: normalizePlainObject(payload),
    });
  },

  onRows(callback) {
    return subscribe("windie:rows", callback);
  },

  onCurrentTurn(callback) {
    return subscribe("windie:current-turn", callback);
  },
});
```

Electron main runtime startup:

```js
const client = new WindieClient({
  localToolLifecycle: createElectronToolSurfaceLifecycle(surfaceRuntime),
  onBackendOpen: () => broadcastConnectionStatus(true),
  onBackendClose: () => broadcastConnectionStatus(false),
});

const agent = await client.wakeUp({
  installAuth: buildDesktopInstallAuth(),
  name: "WindieOS",
  workspacePath,
  builtins: "default",
});

let runtime = agent.conversation({ conversationRef, store });

detachRuntimeEvents = runtime.subscribeEvents((event, snapshot) => {
  broadcastToRenderers("windie:conversation-event", event);
  broadcastToRenderers("windie:rows", snapshot.displayRows);
  broadcastToRenderers("windie:current-turn", snapshot.currentTurn);
});
```

Electron main SDK command allowlist:

```js
const sdkCommandHandlers = {
  async "conversation.send"(payload) {
    const runtime = ensureRuntimeForConversation(payload.conversationRef);
    return runtime.send({
      text: payload.text,
      turnRef: payload.turnRef,
      payload: payload.payload,
    });
  },

  async "conversation.stop"(payload) {
    const runtime = ensureRuntimeForConversation(payload.conversationRef);
    return runtime.stop(payload.turnRef ?? null);
  },

  async "conversations.clearAll"(payload) {
    return agent.clearConversations(payload);
  },

  async "memories.clearAll"(payload) {
    return agent.clearMemories(payload);
  },
};

ipcMain.handle("windie:invoke", async (_event, input) => {
  const command = normalizeSdkCommandName(input?.command);
  const handler = sdkCommandHandlers[command];
  if (!handler) {
    throw new Error(`Unsupported Windie SDK command: ${command}`);
  }

  return handler(input?.payload ?? {});
});
```

SDK public API when a command is missing:

```ts
export class WindieAgent {
  async clearConversations(options?: ClearConversationsOptions) {
    return this.conversationStore.clearAll(options);
  }

  async clearMemories(options?: ClearMemoriesOptions) {
    return this.localRuntime.clearMemories(options);
  }
}
```

Host commands stay separate:

```ts
await invokeHostCommand("window.showMain", { focus: true });
await invokeHostCommand("permissions.request", { permissionId: "screen" });
await invokeHostCommand("workspace.setActive", { workspacePath });
```

## Out Of Scope

- Visual redesign of the chat pill, response overlay, dashboard, settings,
  models, memory, usage, or search surfaces.
- Changing backend prompt construction, provider routing, compaction strategy,
  or hosted API semantics unless inspection proves an SDK public API needs a
  backend route contract change.
- Rewriting sidecar storage from scratch.
- Removing valid Electron-native host commands just because they use IPC.
- Removing all renderer transcript UI caches if they are only display caches
  and not durable runtime sources of truth.
- Changing local DB schema unless an inspected SDK API requires a storage
  semantic fix.
- Preserving backward compatibility for legacy renderer/internal IPC contracts
  unless a verified dependency is documented in the report.

## Ordered Plan

1. Reorient from current files before editing:
   - Read `AGENTS.md`.
   - Run `./bin/docs-list`.
   - Read `docs/docs.json` routes as needed and the nearest `read_when` docs:
     `docs/architecture/frontend_architecture.md`,
     `docs/architecture/runtime_boundary_matrix.md`,
     `docs/sdk/windie_client_runtime.md`,
     `docs/sdk/conversation_runtime.md`,
     `docs/architecture/storage_persistence_change_workflow.md`, and any
     feature-specific docs surfaced by the inventory.
   - Inspect recent commits for all files and symbols that become candidates.
   - Check `git status --short --branch` and preserve unrelated dirty files.

2. Create or update the matching report before implementation:
   - Use
     `docs/plans/2026-06-05-sdk-agent-runtime-ui-display-boundary-refactor-report.md`.
   - Link this plan.
   - Record deterministic findings, classification decisions, checklist
     status, validation commands, deviations, blockers, and commits.
   - If history was compacted, read this plan and the report before making any
     code change.

3. Build a complete current command/runtime inventory:
   - Search renderer, preload, main, shared IPC registries, SDK runtime/stores,
     frontend tests, SDK tests, and sidecar tests for direct IPC, SDK-shaped
     invokes, sidecar RPC names, DB table names, SDK runtime construction, and
     transcript/memory helper names.
   - Include at least these search terms:
     `IpcBridge.invoke`, `INVOKE_CHANNELS`, `window.ipc`,
     `invokeWindieCommand`, `window.windie`, `windie:invoke`,
     `clear-chat-history`, `clear-local-memory`,
     `delete-chat-conversation`, `list-chat-conversations`,
     `search-chat-conversations`, `get-chat-events`,
     `delete-episodic-memory`, `delete-semantic-memory`,
     `list-episodic-memories`, `list-semantic-memories`,
     `chat_events`, `chat_conversation_revisions`,
     `ConversationContinuityService`, `createConversationRuntime`,
     `SidecarConversationStore`, `DesktopMemoryRuntimeClient`,
     `DesktopConversationLibraryClient`, `DesktopLiveTurnRuntimeClient`, and
     `DesktopTranscriptProjectionRuntimeClient`.

4. Classify every found path:
   - `target-compliant-sdk-command`: renderer calls SDK-shaped invoke; main
     calls public SDK API.
   - `target-compliant-sdk-projection`: renderer only renders SDK rows,
     current-turn, or normalized events.
   - `electron-host-command`: window, overlay, permission, workspace, artifact,
     screenshot attachment, local backend status, wakeword UI, or other native
     shell behavior.
   - `sdk-store-local-runtime-internal`: sidecar-shaped names below SDK
     store/local-runtime adapter only.
   - `violation`: renderer/preload/main exposes or uses sidecar/internal names
     for user-facing SDK concepts, or renderer/main reimplements SDK semantics.
   - `unclear`: needs more reading before classification.

5. Reread after deterministic findings:
   - Once the first inventory is classified, reread the relevant source files,
     tests, and docs for every `violation` or `unclear` path.
   - Do not start edits from the first `rg` hit alone.
   - Update the report with the final classification and the reason each
     surviving direct IPC path is allowed or blocked.

6. For each SDK-owned violation, check for an existing SDK public API:
   - If the API exists, route Electron main's allowlisted SDK command to that
     API and route renderer intent to `windie.invoke("sdk.command", payload)`.
   - If the API does not exist, add it to the SDK first on
     `WindieClient`, `WindieAgent`, `ConversationRuntime`, SDK stores, or SDK
     local runtime as appropriate.
   - Keep sidecar RPC/table details behind SDK store/local-runtime adapters.

7. Simplify renderer command organization:
   - Collapse user-facing runtime clients that only rename and forward payloads.
   - Rename or move remaining renderer command helpers so their owner is clear:
     SDK commands, SDK projections, or host commands.
   - Ensure feature components import display/user-intent helpers, not sidecar
     IPC channels or SDK internals.

8. Tighten preload:
   - Prefer `window.windie.invoke(...)` for SDK-owned commands and SDK
     projection subscriptions.
   - Keep generic `window.ipc.invoke(...)` only for host/native commands if the
     implementation pass cannot safely remove it.
   - If generic IPC remains, add or update tests proving SDK-owned concepts are
     not exposed through it.

9. Move or quarantine sidecar-shaped store adapters:
   - If renderer source still contains sidecar-shaped adapter code, decide
     whether it should move to SDK, Electron main, or remain as a clearly named
     SDK store adapter.
   - If it remains, tests must prove feature code reaches it only through SDK
     public APIs or SDK store interfaces.

10. Delete obsolete paths:
    - Remove old direct channel constants, preload allowlist entries, tests,
      docs, and helper modules once no live code uses them.
    - Do not leave compatibility aliases unless the report documents a verified
      dependency and a deletion follow-up.

11. Repeat the inspection loop:
    - Rerun the inventory searches after each implementation slice.
    - Keep changing in-scope violations until the latest inspection finds none.
    - Only stop when all checklist items and success criteria are complete or
      explicitly blocked in the report with concrete reasons.

12. Update docs and CHANGELOG:
    - Update architecture/frontend/SDK docs that describe the command,
      projection, preload, or sidecar boundary.
    - Update `CHANGELOG.md` for repo-visible behavior/API changes.
    - Update this plan only if the approved direction changes; otherwise record
      implementation details in the report.

13. Validate and commit:
    - Run focused tests for changed SDK, renderer, preload, main, and sidecar
      paths.
    - Run docs validation and diff checks.
    - Commit completed work with a conventional commit body describing previous
      behavior, current behavior, validation, and remaining debt.

## Checklist

- [ ] Reread this plan and the matching report before coding, especially after
      history compaction.
- [ ] Run required orientation commands and preserve unrelated dirty worktree
      changes.
- [ ] Build a current command/runtime inventory from live code.
- [ ] Classify every path as SDK command, SDK projection, Electron host command,
      SDK/local-runtime internal, violation, or unclear.
- [ ] Reread all violation and unclear paths until each classification is
      grounded in code and docs.
- [ ] Add missing SDK public APIs before adding renderer/main behavior for SDK
      concepts.
- [ ] Route renderer SDK-owned user intent through SDK-shaped
      `windie.invoke(...)` commands.
- [ ] Route Electron main SDK commands through a strict allowlist to live public
      SDK APIs.
- [ ] Keep renderer feature code display-only for rows, current turn,
      normalized events, and UI state.
- [ ] Keep Electron-native host commands separate from SDK-owned commands.
- [ ] Remove obsolete direct IPC channels, sidecar-shaped preload entries,
      renderer helpers, tests, and docs when they are no longer justified.
- [ ] Rerun ownership inventory after changes and keep fixing until no
      in-scope violations remain.
- [ ] Maintain the matching report with findings, decisions, validations,
      deviations, blockers, and commits.
- [ ] Update docs and `CHANGELOG.md` where behavior/API contracts change.
- [ ] Run validation commands and commit completed work.

## Success Criteria

- Renderer feature code does not call sidecar/internal IPC names for
  user-facing SDK concepts: conversations, memory, send, stop, history, delete,
  clear, search, replay, rehydrate, compact, models, settings, or runtime
  tool/conversation state.
- Renderer feature code renders SDK `displayRows`, `currentTurn`, and
  normalized `conversation-event` projections instead of rebuilding durable
  runtime semantics.
- Electron main exposes one SDK-shaped command invoke path for SDK-owned
  concepts and routes commands through a strict allowlist.
- Electron main command handlers call public SDK APIs on the live
  `WindieClient`, `WindieAgent`, or `ConversationRuntime`.
- Missing user-facing SDK capabilities are added to the SDK before the UI uses
  them.
- Sidecar RPC names, storage table names, and DB semantics are only present in
  sidecar code, SDK store/local-runtime adapters, Electron main implementation
  internals, or tests for those internals.
- Generic preload IPC, if retained, is not available as a path for SDK-owned
  user-facing concepts.
- Existing chat pill, response overlay, dashboard, settings, models, memory,
  usage, search, send, stop, replay, rehydrate, compact, nuke, wakeword, and
  host/window behavior does not regress.
- The final ownership inventory finds no in-scope violations, or the report
  marks the remaining items explicitly blocked with concrete reasons.

## Validation Commands

Always run:

```bash
./bin/docs-list
git diff --check
```

Run focused frontend/preload/main tests based on touched paths, including
applicable tests from:

```bash
cd frontend && npm run test -- \
  RendererAppRuntimeBoundary.test.ts \
  RendererDashboardRuntimeBoundary.test.ts \
  RendererChatRuntimeBoundary.test.ts \
  IpcChannels.test.ts \
  PreloadIpcChannels.test.cjs \
  IpcMainSdkRuntimeBoundary.test.cjs \
  IpcMainBridge.lifecycle.test.cjs \
  IpcMainBridge.query.test.cjs \
  DesktopLiveTurnRuntimeClient.test.ts \
  DesktopBackendTransport.test.ts \
  DesktopConversationLibraryClient.test.ts \
  DesktopConversationContinuityService.test.ts \
  DesktopTranscriptProjectionRuntimeClient.test.ts \
  DesktopMemoryRuntimeClient.test.ts \
  DesktopSettingsRuntimeClient.test.ts \
  ConversationLocalSnapshotLoader.test.ts \
  MemorySection.test.jsx \
  SettingsSection.test.jsx
```

Run SDK tests/build when SDK APIs or stores change:

```bash
cd packages/windie-sdk-js && npm run build
cd frontend && npm run test -- WindieSdkClient.test.ts WindieSdkConversationRuntime.test.ts
```

Run sidecar tests if sidecar storage, memory, chat history, or DB semantics
change:

```bash
./scripts/test-sidecar
```

Run broader checks when changes cross many frontend files:

```bash
cd frontend && npm run test:ci
cd frontend && npm run lint
```

## Assumptions

- The current SDK-shaped `windie:invoke` command bridge already exists and is
  the preferred renderer-to-main SDK command path.
- Electron main already creates or can create a live `WindieClient`,
  `WindieAgent`, and `ConversationRuntime` that command handlers can use.
- Some direct IPC remains valid for Electron-native host behavior. The refactor
  should classify those paths, not blindly replace them.
- Sidecar storage and tool implementation details may remain below SDK
  adapters, but renderer feature code must not depend on those details.
- If inspection finds that a supposedly host-native command is actually a
  user-facing SDK concept, the plan requires moving it to SDK public API first.
- If scope expands into backend API, sidecar schema, or storage migration work,
  the report must document the reason and the relevant workflow docs must be
  read before implementation.

## Approval Gate

Stop after creating this plan. Do not implement until the user reads and
approves it. If the user changes direction, update this plan file first, then
ask for approval again.
