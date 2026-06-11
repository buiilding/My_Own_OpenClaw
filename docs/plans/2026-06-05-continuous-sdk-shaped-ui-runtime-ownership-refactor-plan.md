---
summary: "Plan for continuously refactoring renderer/main command paths until UI runtime ownership matches the SDK-shaped architecture."
read_when:
  - When continuing renderer/main/SDK ownership cleanup after SDK-shaped memory and conversation commands.
  - When auditing whether renderer code still calls sidecar/internal IPC for SDK-owned user-facing concepts.
title: "Continuous SDK-Shaped UI Runtime Ownership Refactor Plan"
---

# Continuous SDK-Shaped UI Runtime Ownership Refactor Plan

## User Intent

The user wants a general, repeatable refactor plan that keeps inspecting the
current code until the UI runtime actually matches the intended ownership model:

- Renderer owns display and user intent only.
- Renderer calls SDK-shaped public commands, such as
  `windie.invoke('conversation.send', payload)`, not sidecar/internal IPC names.
- Electron main owns only the IPC hop, native desktop policy, and a strict
  command allowlist.
- Electron main executes those commands against the live SDK runtime:
  `WindieClient`, `WindieAgent`, and `ConversationRuntime`.
- SDK owns public command semantics, runtime state, conversation history,
  memory commands, send/stop, replay/rehydrate/compact behavior, model/settings
  runtime APIs, and projections.
- Sidecar owns local storage/tool implementation details, but renderer must not
  know sidecar RPC names, DB tables, or internal storage channels for
  user-facing SDK concepts.
- If a needed public SDK API is missing, add it to the SDK first. Do not add
  renderer/main-specific behavior that duplicates SDK ownership.

This plan is intentionally not a fixed file-change list. It instructs the
implementer to continuously inspect, classify, reread, and refactor until the
latest code proves it follows the target architecture.

## Architectural Change

Move from this mixed model:

```text
Renderer feature
  -> renderer facade
  -> typed internal IPC channel or sidecar-shaped command
  -> Electron main / sidecar helper
  -> local sidecar storage or backend transport
```

to this SDK-shaped model:

```text
Renderer feature
  -> window.windie.invoke("sdk.command.name", payload)
  -> preload narrow SDK command bridge
  -> Electron main strict SDK command allowlist
  -> live SDK public API
  -> SDK store/local-runtime/backend transport
  -> sidecar or backend implementation detail
```

Electron-native behavior remains separate:

```text
Renderer display/native intent
  -> narrow native host command
  -> Electron main BrowserWindow / permission / surface policy
```

The refactor must make those two classes obvious:

- SDK-owned user/runtime concepts go through SDK-shaped commands.
- Electron-native shell concepts go through host/native commands.
- Sidecar-shaped RPC names stay below SDK local-runtime/store adapters only.

## Current Preliminary Findings

The initial inspection for this plan ran:

```bash
./bin/docs-list
git status --short --branch
git log --oneline -8 -- frontend/src/renderer/app/runtime frontend/src/renderer/infrastructure/transcript frontend/src/main/ipc.cjs packages/windie-sdk-js/src/runtime packages/windie-sdk-js/src/stores docs/plans
rg -n "IpcBridge\\.invoke\\(|window\\.ipc|window\\.windie|windie\\.invoke|invokeWindieCommand|INVOKE_CHANNELS\\.|WINDIE_SEND|WINDIE_STOP|WINDIE_REHYDRATE|WINDIE_COMPACT_HISTORY|CLEAR_LOCAL_MEMORY|CLEAR_CHAT_HISTORY|LIST_CHAT_CONVERSATIONS|GET_CHAT_EVENTS|DesktopLiveTurnRuntimeClient|DesktopConversationLibraryClient|DesktopTranscriptProjectionRuntimeClient|DesktopConversationContinuityService|localConversationStore|sdkSidecarConversationStore" frontend/src/renderer frontend/src/preload.js frontend/src/main/ipc.cjs frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs frontend/src/shared/ipcChannels.json packages/windie-sdk-js/src
```

Preliminary gaps to inspect and classify before implementation:

- `frontend/src/preload.js` still exposes generic `window.ipc.invoke(...)`.
  This may allow new renderer code to call internal IPC channels directly even
  after SDK-shaped command paths exist.
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts` still
  sends user-facing send/stop through `WINDIE_SEND` and `WINDIE_STOP` instead
  of SDK-shaped `conversation.send` / `conversation.stop`.
- `frontend/src/renderer/app/runtime/desktopBackendTransport.ts` still wraps
  `WINDIE_SEND`, `WINDIE_STOP`, `WINDIE_REHYDRATE`,
  `WINDIE_COMPACT_HISTORY`, settings, model list, and wakeword IPC channels.
  The implementer must decide whether this renderer-side backend transport
  remains a justified SDK transport adapter or whether those commands should
  move fully behind Electron main SDK command routing.
- `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`
  still invokes `LIST_CHAT_CONVERSATIONS`, `SEARCH_CHAT_CONVERSATIONS`, and
  `GET_CHAT_EVENTS`. This must be classified as internal replay/edit storage
  machinery, migrated behind SDK APIs, or deleted.
- `frontend/src/renderer/infrastructure/transcript/sdkSidecarConversationStore.ts`
  maps SDK store RPC methods to sidecar-shaped IPC. This may remain acceptable
  only if it is strictly an SDK store adapter implementation detail and not a
  renderer-facing feature API.
- `frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient.ts`
  still owns renderer-side transcript persistence calls. This must be audited
  against the rule that SDK owns conversation store/projection semantics and
  renderer displays.
- Many renderer `IpcBridge.invoke(...)` calls are Electron-native and likely
  acceptable, including window controls, permission probes, workspace
  selection, artifact upload/fetch, screenshot attachment capture, and surface
  sizing. The plan must not blindly replace these. It must classify each path
  by owner.

These findings are starting points only. The implementer must rerun searches
and inspect call graphs during execution until no unclassified path remains.

## Conceptual Target Code

Renderer user-facing SDK commands:

```ts
// Renderer: display code expresses intent only.
await window.windie.invoke('conversation.send', {
  conversationRef,
  text,
  turnRef,
  payload,
});

await window.windie.invoke('conversation.stop', {
  conversationRef,
  turnRef,
});

const snapshot = await window.windie.invoke('conversation.load', {
  conversationRef,
});

const rows = await window.windie.invoke('conversations.list', {
  limit: 100,
});

await window.windie.invoke('memories.clearAll', {
  userId,
});
```

Preload should expose a narrow SDK command bridge, not arbitrary runtime power:

```js
contextBridge.exposeInMainWorld('windie', {
  invoke(command, payload = {}) {
    if (!SDK_COMMAND_NAME_PATTERN.test(command)) {
      return Promise.reject(new Error('Invalid Windie SDK command'));
    }

    return ipcRenderer.invoke('windie:invoke', {
      command,
      payload: normalizePlainObject(payload),
    });
  },
});
```

Electron main should route only named commands:

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

  async 'conversation.load'(payload) {
    const runtime = ensureRuntimeForConversation(payload.conversationRef);
    return runtime.load();
  },

  async 'conversations.clearAll'() {
    return agent.clearConversations();
  },

  async 'memories.clearAll'(payload) {
    return agent.clearMemories({ userId: payload.userId });
  },
};

ipcMain.handle('windie:invoke', async (event, input) => {
  const command = normalizeCommand(input.command);
  const handler = sdkCommandHandlers[command];
  if (!handler) {
    return { ok: false, error: `Unsupported Windie SDK command: ${command}` };
  }
  return { ok: true, data: await handler(input.payload ?? {}) };
});
```

If a command does not exist in the SDK, add it to the SDK first:

```ts
export class WindieAgent {
  async clearConversations(options?: ClearConversationsOptions): Promise<void> {
    return this.defaultConversationStore.clearConversations(options);
  }

  async listMemories(options: ListMemoriesOptions): Promise<ListMemoriesResult> {
    return this.localRuntime.rpc({
      method: 'list_episodic_memories',
      params: sdkMemoryOptionsToSidecarParams(options),
    });
  }
}
```

Renderer-native host commands should remain separate and explicit:

```ts
// Good: native desktop UI policy, not SDK conversation semantics.
await host.invoke('window.showMain', { focus: true });
await host.invoke('surface.setChatboxHitTestActive', { active: true });
await host.invoke('permissions.request', { permissionId });
```

## Out Of Scope

- Redesigning the UI layout, chat pill visuals, dashboard layout, or settings
  appearance.
- Rewriting backend agent loop, prompt construction, provider routing, or
  backend model-facing tool policy.
- Removing sidecar storage or local tool implementation details.
- Removing Electron-native IPC for BrowserWindow policy, permissions,
  workspace selection, screenshots, artifact upload/fetch, window controls, or
  surface sizing unless inspection proves a command is actually SDK-owned.
- Preserving backwards compatibility for old renderer-facing sidecar command
  names unless a verified external dependency is documented and approved.

## Ordered Plan

1. Re-orient before touching code.
   - Run `./bin/docs-list`.
   - Read current `AGENTS.md`.
   - Read the relevant `read_when` docs from docs-list, at minimum:
     `docs/architecture/frontend_architecture.md`,
     `docs/architecture/runtime_boundary_matrix.md`,
     `docs/sdk/windie_client_runtime.md`,
     `docs/sdk/conversation_runtime.md`,
     and `docs/architecture/storage_persistence_change_workflow.md`.
   - Inspect recent commits for every subsystem touched.

2. Build a live command/path inventory.
   - Search renderer, preload, Electron main, SDK, sidecar bridge, and tests
     for direct IPC calls, channel constants, sidecar RPC names, and app
     runtime facades.
   - Record every finding in the matching report file before implementation.
   - Classify each finding as one of:
     - `target-compliant SDK command`
     - `Electron-native host command`
     - `SDK/local-runtime/store internal`
     - `renderer-facing SDK-owned violation`
     - `unclear, needs reread`

3. Reread after deterministic findings.
   - Once the first inventory is complete, reread each owning module and nearby
     tests until the implementer can explain who owns the command and why.
   - Do not start implementation while any path is still `unclear`.
   - If a path remains ambiguous after reread, update the plan/report with the
     ambiguity and ask the user before changing it.

4. Identify missing SDK public APIs.
   - For every renderer-facing SDK-owned violation, check whether an SDK public
     API already exists on `WindieClient`, `WindieAgent`,
     `ConversationRuntime`, SDK stores, or SDK projections.
   - If it exists, route Electron main `windie:invoke` handlers to it.
   - If it does not exist, add the SDK API first, with focused SDK tests, then
     route Electron main to that API.

5. Migrate renderer user-facing SDK commands.
   - Replace renderer calls to old SDK-owned IPC/channel paths with
     `invokeWindieCommand(...)` / `window.windie.invoke(...)`.
   - Priority order:
     - send/stop (`conversation.send`, `conversation.stop`)
     - rehydrate/replay/compact (`conversation.rehydrate`,
       `conversation.compact`, or better SDK-owned methods if available)
     - transcript projection/persistence paths
     - model/settings SDK runtime commands if they are SDK-owned rather than
       Electron-native config persistence
   - Keep renderer-native commands on a clearly separate native host bridge.

6. Tighten preload and renderer imports.
   - Decide whether generic `window.ipc.invoke(...)` should remain exposed to
     all renderer code.
   - If it must remain temporarily, add tests that forbid renderer feature code
     from using it for SDK-owned concepts.
   - Prefer named bridges:
     - `window.windie.invoke(...)` for SDK concepts.
     - `window.windieHost.invoke(...)` or equivalent for native host concepts.

7. Delete or quarantine old paths.
   - Remove renderer-facing old channels once no renderer user action needs
     them.
   - If sidecar-shaped names must remain for SDK store/local-runtime internals,
     keep them in a narrow adapter and document why.
   - Do not leave duplicate renderer APIs for the same concept.

8. Repeat inspection until clean.
   - Rerun the full search inventory after every implementation slice.
   - Continue reading and changing code until all findings are one of:
     `target-compliant SDK command`, `Electron-native host command`, or
     `documented SDK/local-runtime/store internal`.
   - Any newly discovered violation extends the plan/report checklist before
     implementation continues.

9. Add or update focused tests.
   - Renderer runtime facade tests must assert SDK-shaped command names.
   - Main IPC tests must assert strict allowlist routing to SDK public APIs.
   - SDK tests must cover newly added public APIs.
   - Boundary scan tests must fail if renderer feature code calls old
     SDK-owned sidecar/internal command names.
   - Sidecar tests must cover storage behavior only when sidecar semantics
     change.

10. Update docs, changelog, and execution report.
    - Update docs that describe frontend flow, SDK runtime, command ownership,
      or IPC boundaries.
    - Update `CHANGELOG.md`.
    - Create or update a matching report file under `docs/plans/` while
      implementing. The report must link this plan, track checklist and success
      criteria, list commits, and record validation results, decisions,
      deviations, and blockers.

11. Validate and commit.
    - Run validation commands listed below.
    - Rebuild SDK package output if TypeScript SDK source changes.
    - Stage only files for this plan; preserve unrelated dirty worktree files.
    - Commit completed work with the required commit body.

## Continuous Inspection Checklist

- [ ] Ran docs-list and read relevant docs.
- [ ] Inspected recent commits for touched subsystems.
- [ ] Built a command/path inventory from live code.
- [ ] Classified every renderer/main/SDK/sidecar path found.
- [ ] Reread all unclear ownership paths until none remain unclear.
- [ ] Identified every renderer-facing SDK-owned violation.
- [ ] Checked whether matching SDK public APIs already exist.
- [ ] Added missing SDK APIs before routing renderer/main behavior.
- [ ] Migrated renderer user-facing SDK commands to `windie.invoke(...)`.
- [ ] Kept Electron-native commands separate from SDK commands.
- [ ] Deleted or quarantined old renderer-facing sidecar/internal paths.
- [ ] Reran full searches after each implementation slice.
- [ ] Updated tests, docs, changelog, and report.
- [ ] Committed completed work without unrelated dirty files.

## Success Criteria

- Renderer feature code does not call sidecar/internal IPC names for
  conversations, memory, send, stop, history, delete, clear, search, replay,
  compact, rehydrate, model runtime commands, or settings runtime commands
  where those concepts are SDK-owned.
- Renderer user-facing SDK concepts go through SDK-shaped command names.
- Electron main has one strict SDK command allowlist and calls public SDK APIs.
- Missing public SDK functions are added to the SDK instead of being invented in
  renderer or Electron main.
- Sidecar-shaped RPC names are visible only inside SDK local-runtime/store
  adapters or Electron sidecar bridge internals.
- Generic `window.ipc.invoke(...)` cannot be used by renderer feature code to
  reach SDK-owned concepts.
- Existing Electron-native host behavior still works: windows, permissions,
  overlays, screenshots, artifacts, workspace selection, and native surface
  policy.
- Existing chat pill/dashboard behavior does not regress.
- Boundary tests prove the ownership contract and fail on reintroduced old
  paths.

## Validation Commands

Run the smallest focused slice first, then broaden if touched code requires it:

```bash
./bin/docs-list

cd packages/windie-sdk-js && npm run build

cd frontend && npm run test -- \
  DesktopLiveTurnRuntimeClient.test.ts \
  DesktopConversationLibraryClient.test.ts \
  DesktopMemoryRuntimeClient.test.ts \
  PreloadIpcChannels.test.cjs \
  IpcMainSdkRuntimeBoundary.test.cjs \
  RendererAppRuntimeBoundary.test.ts \
  RendererDashboardRuntimeBoundary.test.ts \
  WindieSdkClient.test.ts \
  WindieSdkConversationRuntime.test.ts

./scripts/python-in-env sidecar pytest tests/sidecar

git diff --check
```

Adjust the focused Jest/Pytest list to include every touched behavior. If
preload, IPC, SDK stores, sidecar storage, or renderer runtime boundaries are
touched, do not skip their focused tests.

## Assumptions

- The previous SDK-shaped memory/conversation command refactor is present.
- Electron main already has access to a live `WindieClient` /
  `WindieAgent` / `ConversationRuntime` after `wakeUp(...)`.
- Some direct IPC from renderer to main is valid for Electron-native host
  concerns. The plan should remove direct renderer IPC only for SDK-owned
  concepts, not for every native desktop operation.
- Sidecar RPC names may remain as implementation details if they are not
  renderer-facing user APIs and are reached only through SDK local-runtime/store
  abstractions.
- This plan should be updated if inspection finds a better public SDK boundary
  than the examples above.

## Approval Gate

Stop here. Do not implement until the user reads and approves this plan. If the
user changes direction, update this plan file first, then wait for approval
again.
