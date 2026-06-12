---
summary: "Plan to make SDK local tool execution first-class and remove Electron-owned duplicate local-runtime authority."
read_when:
  - When changing SDK local runtime APIs, desktop browser/tool execution, sidecar startup, or local-backend bridge ownership.
  - When deciding whether a local tool call must require a WindieAgent or conversation loop.
title: "SDK Local Runtime First-Class Plan"
---

# SDK Local Runtime First-Class Plan

Status: implemented.

## User Intent

The SDK should be pluggable and layered. Local tool execution must not require an
agent loop, active conversation, or model turn. App hosts should be able to use
the SDK to start or attach to the local sidecar runtime and call tools directly.

The desktop codebase should follow that ownership model:

- SDK owns local sidecar startup, reuse, discovery validation, HTTP/RPC client
  lifecycle, tool execution, event subscription, and shutdown.
- Agent/conversation runtime owns model loop semantics and backend tool-result
  return, but it should consume the same local-runtime primitive rather than
  being the only way to get one.
- Electron main owns windows, permissions, IPC, app lifecycle, display bounds,
  artifact shaping, and native host policy. It must not own a duplicate
  local-runtime provider/cache.
- Renderer owns display state only and never executes tools.
- Python sidecar owns local machine authority and concrete tool implementations.

## Current State

The SDK already has the low-level pieces:

- `WindieLocalRuntimeClient`
- `SidecarDaemonHttpClient`
- `createWindieLocalRuntimeProvider(...)`
- local runtime methods for `status`, `listTools`, `executeTool`, `rpc`,
  event subscription, registration, and shutdown

But the ergonomic lifecycle is still mostly agent-centered:

- `WindieClient.wakeUp(...)` starts/reuses the local runtime when agent features
  need memory, persistence, builtins, tools, plugins, or MCPs.
- `WindieClient.status()`, `listTools()`, and `shutdownLocalRuntime()` only use a
  known/configured runtime; they do not ensure a runtime exists.
- There is no first-class public SDK method like `client.localRuntime()` or
  `client.executeTool(...)` that starts/reuses the sidecar without creating an
  agent/backend websocket session.
- Electron `local_backend_bridge.cjs` still has duplicate local-runtime
  provider/cache authority as a fallback, even though it now prefers the active
  SDK agent runtime when present.

## Target Architecture

Introduce one SDK-owned local-runtime surface that works with or without an
agent:

```ts
const client = new WindieClient({
  autoSidecar: desktopLaunchOptions,
});

const runtime = await client.localRuntime();
await runtime.executeTool({
  toolName: "browser",
  args: {
    action: "connect",
    explanation: "Open the WindieOS browser.",
  },
});
```

Then route both standalone tool calls and agent tool calls through the same
runtime object:

```text
Standalone SDK local tool call
  -> WindieClient.localRuntime()
  -> WindieLocalRuntimeClient.executeTool(...)
  -> sidecar /execute-tool

Agent/conversation model tool call
  -> WindieClient.wakeUp(...)
  -> WindieAgent / ConversationRuntime
  -> same WindieLocalRuntimeClient.executeTool(...)
  -> backend tool-result return

Electron browser button / permission warmup
  -> Electron IPC facade
  -> WindieClient.localRuntime()
  -> WindieLocalRuntimeClient.executeTool(...)
  -> sidecar /execute-tool
```

`WindieAgent` should not be the local-runtime source of truth. It can expose
helpers for convenience, but those helpers should delegate to the owning
`WindieClient` local-runtime manager.

## Proposed SDK API

Add a public local-runtime manager surface to `WindieClient`:

```ts
type WindieLocalRuntimeRequest = {
  reason?: string;
  require?: boolean;
};

class WindieClient {
  localRuntime(options?: WindieLocalRuntimeRequest): Promise<WindieLocalRuntimeClient>;
  getKnownLocalRuntime(): WindieLocalRuntimeClient | null;
  executeTool(call: {
    toolName: string;
    args: JsonRecord;
    timeoutMs?: number;
  }, options?: WindieLocalRuntimeRequest): Promise<LocalToolResult>;
  rpc(payload: {
    method: string;
    params?: JsonRecord;
    id?: string | number;
  }, options?: WindieLocalRuntimeRequest): Promise<JsonRecord>;
  listLocalTools(options?: WindieLocalRuntimeRequest): Promise<LocalToolManifest>;
  localStatus(options?: WindieLocalRuntimeRequest): Promise<JsonRecord>;
  shutdownLocalRuntime(): Promise<void>;
}
```

Naming can be adjusted during implementation, but the important contract is:

- `localRuntime()` ensures/start/reuses local runtime without creating an agent.
- `getKnownLocalRuntime()` is non-starting and returns the cached/configured
  runtime or `null`.
- direct `executeTool` and `rpc` are convenience helpers over `localRuntime()`.
- existing `status()` and `listTools()` behavior should either be preserved as
  non-starting methods or renamed/deprecated in favor of explicit
  `localStatus()` / `listLocalTools()` to avoid hidden startup.

## Required Codebase Changes

### Phase 1: SDK Local Runtime Manager

- Extract local-runtime resolution from `WindieClient.wakeUp(...)` into a
  reusable private manager.
- Make `wakeUp(...)` call the manager instead of owning local-runtime startup
  inline.
- Add public SDK methods for standalone local-runtime access and direct tool/RPC
  execution.
- Preserve existing configuration modes:
  - explicit `sidecar` / `localRuntime`
  - `sidecarDaemon`
  - `ensureLocalRuntime`
  - `autoSidecar`
  - `autoStartLocalRuntime: false`
- Keep browser-hosted SDK behavior explicit: browser callers must provide a
  runtime, daemon client, or provider.

### Phase 2: Agent Delegation

- Update `WindieAgent.status()`, `listTools()`, `shutdownLocalRuntime()`, and
  local-memory helpers where appropriate to delegate through the owner
  `WindieClient` local-runtime manager instead of treating the agent as the
  source of runtime truth.
- Preserve conversation runtime semantics: agent/conversation still owns
  backend result return after model tool calls, but tool execution uses the same
  runtime client as standalone calls.
- Keep `localToolLifecycle.beforeExecute(...)` in the SDK execution path so
  Electron can still apply host-only leases for screenshots/pointer control.

### Phase 3: Electron Bridge Deletion

- Delete the Electron bridge's duplicate local-runtime provider/cache:
  - `createWindieLocalRuntimeProvider(...)` import in
    `local_backend_bridge.cjs`
  - bridge-owned `sdkLocalRuntimeProvider`
  - bridge-owned cached local runtime source/snapshot/session state where it
    duplicates SDK runtime manager state
  - bridge fallback startup path in `wakeSdkLocalRuntimeForStatus`
- Pass an SDK local-runtime resolver from `ipc.cjs` / main startup into the
  bridge:
  - `ensureLocalRuntimeForHost({ reason })`
  - `getKnownLocalRuntimeForHost()`
- Keep the bridge as a host IPC facade only:
  - renderer `run-browser-action`
  - renderer `get-local-backend-status`
  - screenshot attachment shaping
  - permission warmup/probes
  - diagnostics
  - native window/display policy
- Route bridge tool execution through the SDK local-runtime manager, not through
  a bridge-owned provider.

### Phase 4: Browser Button And Permission Paths

- Route `Connect browser`, browser status sync, browser tab commands, and
  browser permission warmup through SDK standalone local tool execution.
- Ensure pre-conversation paths work without creating a backend websocket agent
  unless a caller explicitly asks for agent behavior.
- Keep Browser Use/session mechanics in the sidecar browser runtime.
- Preserve current sanitized `browser.session_control` diagnostics, but update
  event fields so they describe SDK local-runtime manager state instead of
  bridge-owned runtime state.

### Phase 5: Docs, Examples, And Compatibility Cleanup

- Update SDK docs to describe three independent layers:
  - local runtime/tool execution
  - hosted backend client APIs
  - agent/conversation model loop
- Add examples:
  - standalone local browser connect/status
  - standalone filesystem/shell tool call
  - agent conversation with builtins using the same runtime manager
- Update Electron/frontend architecture docs to say Electron passes launch facts
  and host policy; SDK owns local-runtime lifecycle.
- Remove stale docs that imply local tool execution requires `wakeUp(...)` or an
  active `WindieAgent`.
- Keep migration notes explicit: no persisted-data migration expected; behavior
  migration is API/ownership only.

## Out Of Scope

- Rewriting Python sidecar tool implementations.
- Changing backend provider/model tool-loop semantics.
- Changing model-visible browser/filesystem/shell schemas except where tests
  reveal existing drift.
- Building a plugin marketplace or long-term extension package manager.
- Changing browser automation engine internals beyond using the SDK local
  runtime to reach the sidecar.

## Tests

SDK-focused:

- `WindieClient.localRuntime()` starts/reuses `autoSidecar` without creating an
  agent session or backend websocket.
- `WindieClient.localRuntime()` reuses explicit `sidecar`, `localRuntime`, and
  `sidecarDaemon` configs.
- `WindieClient.executeTool(...)` calls sidecar `/execute-tool` through the SDK
  runtime manager.
- `WindieClient.rpc(...)` unwraps sidecar JSON-RPC results consistently with the
  current daemon client behavior.
- `WindieClient.wakeUp(...)` reuses the same local runtime manager rather than
  creating a second runtime.
- `autoStartLocalRuntime: false` fails closed for local-tool calls that require
  startup.
- Browser-hosted SDK callers do not auto-start Node sidecar by accident.

Electron/main-focused:

- `get-local-backend-status` uses the SDK local-runtime resolver and does not
  instantiate a bridge-owned provider.
- `run-browser-action` executes through SDK standalone local tool execution.
- permission browser warmup uses the SDK local-runtime path without requiring an
  active conversation.
- screenshot/file host helper paths keep host-only shaping while using SDK
  runtime execution.
- bridge lifecycle tests assert no local runtime provider/cache remains in the
  bridge.

Regression/contract:

- SDK conversation runtime still returns backend tool results after model tool
  calls.
- `localToolLifecycle.beforeExecute` still wraps sidecar execution.
- browser connect/status still work before the first chat turn.
- app diagnostics remain sanitized and do not log browser URLs, page titles,
  local paths, tokens, raw payloads, screenshots, or stack traces.

## Validation Commands

Focused first:

```bash
bin/windie test frontend -- WindieSdkClient.test.ts WindieSdkConversationRuntime.test.ts LocalBackendBridge.lifecycle.test.cjs LocalBackendBridge.rpc.test.cjs BrowserSessionStore.test.js ChatBrowserSessionControl.test.jsx PermissionIpcRuntime.test.cjs
```

Then broader checks:

```bash
bin/windie test frontend
bin/windie docs list
git diff --check
cd frontend && npm run lint
```

If SDK package exports change:

```bash
cd packages/windie-sdk-js && npm run build
```

## Success Criteria

- SDK users can start/reuse local runtime and call tools without creating a
  `WindieAgent`, conversation, backend websocket, or model loop.
- Agent/conversation tool execution and standalone tool execution share the same
  SDK local-runtime manager.
- Electron main no longer imports or instantiates `createWindieLocalRuntimeProvider`
  from `local_backend_bridge.cjs`.
- The local-backend bridge remains only as an IPC/host-policy facade.
- Browser connect/status works before any conversation exists.
- Browser connect/status also works after an agent exists, without switching to
  a different sidecar client.
- Tests prove the bridge has no duplicate local-runtime ownership.
- Docs present local runtime, hosted SDK APIs, and agent/conversation loop as
  separate composable SDK layers.

## Reread Anchors After Compaction

- This plan.
- Matching report once created:
  `docs/plans/2026-06-12-sdk-local-runtime-first-class-report.md`
- `docs/sdk/windie_client_runtime.md`
- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `docs/architecture/frontend_architecture.md`
- `frontend/src/main/sidecar/local_backend_bridge.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/index.cjs`
- `packages/windie-sdk-js/src/runtime/WindieClient.ts`
- `packages/windie-sdk-js/src/runtime/LocalSidecarRuntime.ts`
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`

## Approval Question

Approve this plan if the intended product direction is:

```text
SDK local runtime is a first-class tool-execution layer.
WindieAgent is a consumer of that layer, not the owner of it.
Electron main is also a consumer of that layer, not a runtime owner.
```

After approval, implementation should proceed in small commits by phase, with a
matching report kept current through validation and inspection.
