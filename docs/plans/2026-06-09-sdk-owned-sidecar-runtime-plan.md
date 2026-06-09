---
summary: "Plan to make the SDK own sidecar daemon startup/reuse and delete Electron main's duplicate sidecar daemon runtime client."
read_when:
  - When changing WindieClient local-runtime startup, Electron desktop sidecar integration, sidecar daemon discovery/reuse, or local runtime ownership.
  - When debugging desktop chat history, memory, local tool execution, or semanticization failures caused by sidecar daemon contract drift.
title: "SDK-Owned Sidecar Runtime Plan"
---

# SDK-Owned Sidecar Runtime Plan

## User Intent

The user wants the desktop app to follow the same ownership model as SDK
examples:

```text
Electron main
  -> creates WindieClient
  -> passes SDK sidecar launch options:
       python path, daemon script, env/auth paths, discovery path
  -> calls wakeUp()

SDK
  -> starts/reuses sidecar
  -> owns SidecarDaemonHttpClient
  -> owns JSON-RPC unwrapping
  -> owns memory, persistence, local tool runtime contracts
```

This should be deletion-first. The SDK already has an auto-sidecar path and a
correct `SidecarDaemonHttpClient.rpc()` unwrapping contract, so the desktop app
should stop passing an Electron-owned almost-compatible daemon runtime into the
SDK.

## Current Verified Findings

Recent related commits:

- `2f83891ba fix(frontend): share electron sidecar with sdk` made Electron pass
  `ensureDaemonBackedLocalRuntime` into `WindieClient`. This avoided two daemon
  processes, but it made the SDK consume Electron's daemon client contract.
- `15214e41b fix(cli): pin sidecar python from env wrapper` fixed desktop dev
  sidecar interpreter selection by exporting `WINDIE_PYTHON_PATH` from
  `scripts/python-in-env frontend|sidecar`.

Current code shape:

- `WindieClient.resolveLocalRuntimeForWakeUp(...)` already starts a local
  runtime through `createWindieLocalRuntimeProvider(...)` when memory,
  persistence, builtins, tools, plugins, or MCPs need one and no explicit local
  runtime provider is supplied.
- SDK `SidecarDaemonHttpClient.rpc(...)` correctly unwraps JSON-RPC envelopes:
  it returns `response.result`, not the raw `{ jsonrpc, id, result }` envelope.
- Electron `local_backend_bridge.cjs` currently creates a
  `sidecarDaemonManager`, starts the daemon for local backend readiness, and
  exports `ensureDaemonBackedLocalRuntime()` for the SDK.
- Electron `sidecar_daemon_manager.cjs` duplicates daemon client behavior and
  currently returns raw JSON-RPC envelopes from `SidecarDaemonNodeClient.rpc`.
  When that client is used as the SDK local runtime, SDK stores normalize the
  missing `data` field to empty results. That reproduced as:

```text
raw_jsonrpc_envelope: 0 conversations
unwrapped_result: 3 conversations
```

Why Electron's duplicate daemon manager exists today:

- It has desktop packaging and launch concerns that the current SDK
  auto-sidecar provider does not fully model yet:
  packaged Python/binary launch target resolution, sidecar script path
  resolution, launch env construction, stale discovery rejection by launch
  context, auth-state path injection, permission-state path injection,
  semantic-summarizer/backend env, browser feature-pack flags, stderr handling,
  local-backend readiness status, and conversation metadata invalidation event
  forwarding.

## Target Architecture

Target runtime boundary:

```text
Electron main
  - owns BrowserWindow, app lifecycle, renderer IPC, permissions, desktop
    surface policy, and localToolLifecycle leases
  - supplies sidecar launch configuration to the SDK
  - receives SDK local-runtime events/status for UI broadcasts
  - does not own sidecar HTTP/RPC protocol semantics

SDK
  - owns local runtime startup/reuse
  - owns sidecar discovery validation and stale daemon replacement
  - owns SidecarDaemonHttpClient and JSON-RPC envelope unwrapping
  - owns sidecar-backed conversation store, memory, plugins, MCPs, builtins,
    local tool registration, local tool execution contract, and event
    subscription contract

Python sidecar
  - owns local authority, local tools, local memory/storage, browser/filesystem/
    shell/computer execution
```

Important distinction:

- Electron may supply host facts needed to launch a local process.
- Electron must not implement the SDK local runtime protocol or interpret
  sidecar RPC envelopes for SDK-owned behavior.

## Source Of Truth Changes

| Surface | Current owner/risk | Target owner |
| --- | --- | --- |
| Sidecar daemon HTTP client | Duplicated in SDK and Electron main | SDK only |
| JSON-RPC unwrapping | Correct in SDK, wrong in Electron adapter | SDK only |
| Daemon auto-start/reuse | SDK for examples, Electron for desktop | SDK for all `WindieClient` callers |
| Packaged Python/binary launch config | Electron-only helpers | Electron computes options; SDK executes |
| Launch-context stale daemon guard | Electron daemon manager | SDK auto-sidecar provider |
| Local backend readiness UI status | Electron local backend bridge | Electron consumes SDK runtime status/events |
| Tool execution display/window shaping | Electron host policy plus sidecar execution | Keep Electron host policy, route execution through SDK local runtime |
| Conversation metadata invalidation | Electron daemon manager event subscription | SDK local runtime event subscription, Electron broadcasts typed UI event |

## In Scope

- Extend the SDK auto-sidecar launch contract so desktop can pass host launch
  facts instead of a local runtime implementation.
- Move the Electron daemon launch-context behavior into the SDK provider or an
  SDK-owned helper:
  launch env, discovery metadata validation, stale daemon shutdown/replacement,
  and reusable `SidecarDaemonHttpClient`.
- Update Electron main startup to pass `autoSidecar`/SDK launch options to
  `WindieClient` instead of `ensureLocalRuntime`.
- Delete `ensureDaemonBackedLocalRuntime()` from Electron main.
- Delete or shrink Electron `sidecar_daemon_manager.cjs` so it is no longer a
  second SDK local-runtime daemon client.
- Preserve desktop-specific launch facts:
  packaged/dev Python path, sidecar daemon script/binary path, auth-state path,
  permission-state path, backend endpoint env, semantic summarizer env, browser
  feature-pack autoinstall env, and discovery path.
- Preserve renderer-visible local backend readiness and conversation metadata
  invalidation behavior, but make them consume SDK local-runtime status/events.
- Add focused tests that fail if Electron passes a custom local runtime into
  `WindieClient` or if SDK sidecar RPC envelopes are not unwrapped.
- Update docs to mark SDK sidecar startup as current desktop behavior after the
  implementation lands.

## Out Of Scope

- Rewriting the full local tool execution lifecycle.
- Removing the Python sidecar or changing sidecar tool implementations.
- Changing backend provider policy, prompt construction, or model-visible tool
  schemas.
- Redesigning renderer dashboard/sidebar UI.
- Changing local memory DB schema or migrating existing memory/chat rows.
- Removing Electron host policy for screenshots, pointer leases, content
  protection, display affinity, or permissions.

## Design Rules

- Do not fix the current bug by only adding `return response.result` to
  Electron's daemon client and leaving duplicate sidecar clients as the long-term
  architecture.
- Do not add a second adapter layer whose only job is to rename Electron daemon
  responses into SDK responses.
- Do not let Electron main call sidecar chat/memory RPC methods for
  SDK-owned conversation or memory behavior.
- Do not keep both `ensureLocalRuntime: ensureDaemonBackedLocalRuntime` and
  `autoSidecar` active for desktop startup.
- Do not regress packaged app launch: packaged builds must not silently fall
  back to a user-installed Python interpreter when bundled runtime resolution
  fails.
- Do not regress dev launch: `scripts/python-in-env frontend|sidecar` must still
  pin `WINDIE_PYTHON_PATH` so the sidecar imports `aiohttp`.
- Keep `localToolLifecycle` as the Electron host hook for native surface leases;
  do not move BrowserWindow mechanics into the SDK.

## Ordered Workflow

1. Create the matching report after approval:
   `docs/plans/2026-06-09-sdk-owned-sidecar-runtime-report.md`.
2. Reread after compaction:
   this plan, the report, `docs/sdk/windie_client_runtime.md`,
   `docs/development/agent_runtime_ownership_and_change_routing.md`,
   `docs/architecture/runtime_boundary_matrix.md`,
   `packages/windie-sdk-js/src/runtime/WindieClient.ts`,
   `packages/windie-sdk-js/src/runtime/LocalSidecarRuntime.ts`,
   `frontend/src/main/ipc.cjs`,
   `frontend/src/main/sidecar/local_backend_bridge.cjs`,
   `frontend/src/main/sidecar/sidecar_daemon_manager.cjs`,
   `frontend/src/main/app/runtime_paths.cjs`,
   `frontend/src/main/sidecar/local_backend_bridge_execute_tool_runtime.cjs`,
   and the focused tests named below.
3. Inspect current Electron daemon responsibilities and classify each as:
   SDK local-runtime behavior, Electron host launch fact, Electron UI/status
   broadcast, or legacy standalone-local-backend fallback.
4. Extend `WindieAutoSidecarOptions` in the SDK with the missing host launch
   facts. Expected additions include launch env overrides, spawn options or cwd
   where needed, explicit daemon command/args support for packaged binary
   targets, discovery launch-context validation, stale-discovery policy, and
   optional stderr/log callbacks.
5. Move or recreate launch-context validation in SDK-owned code:
   read discovery metadata, compare expected launch context, reject or shut down
   stale daemons, then start/reuse through `SidecarDaemonHttpClient`.
6. Add SDK tests before changing Electron startup:
   packaged/dev launch options are honored, stale discovery is rejected,
   JSON-RPC results unwrap, event subscriptions work, and the provider can start
   through `scripts/python-in-env sidecar python`.
7. Change Electron `startWindieAgent(...)` to construct `WindieClient` with
   SDK `autoSidecar` launch options instead of `ensureLocalRuntime`.
8. Keep Electron computing host facts through a small launch-options helper.
   It may call `resolveSidecarLaunchTarget(...)`, but it must return data for
   the SDK to execute rather than returning a local runtime client.
9. Route local backend readiness and metadata invalidation through the SDK local
   runtime:
   when the SDK runtime is available, Electron subscribes to local runtime
   events and broadcasts `local-backend-status` and
   `windie:conversation-metadata-invalidated` as UI-facing signals.
10. Update Electron local tool execution:
    preserve display bounds, screenshot materialization, MCP local execution,
    and host-specific argument shaping, but ensure sidecar execution uses the
    SDK-owned local runtime/client path rather than an Electron daemon client.
11. Delete `ensureDaemonBackedLocalRuntime()` and remove the assertion in
    `IpcMainSdkRuntimeBoundary.test.cjs` that currently requires it.
12. Delete or reduce `sidecar_daemon_manager.cjs`. If any small pieces remain,
    they must be host helpers only, not an HTTP/RPC daemon client or local
    runtime implementation.
13. Rebuild SDK ESM/CJS output so Electron imports the updated CJS runtime.
14. Update docs:
    `docs/sdk/windie_client_runtime.md` and any runtime ownership doc that still
    says Electron owns sidecar lifecycle for SDK startup.
15. Run validation and record every result in the report.
16. Perform a fresh deletion inspection:
    search for `ensureDaemonBackedLocalRuntime`, `ensureLocalRuntime:
    ensureDaemonBackedLocalRuntime`, `SidecarDaemonNodeClient`,
    `sidecarDaemonManager.rpc`, raw `jsonrpc` daemon client returns, and
    Electron-local `list_chat_conversations` style usage outside mapper tests.
    Classify any remaining hit as deleted, intentionally out of scope, or still
    requiring another slice.

## Checklist

- [ ] Report created after approval.
- [ ] SDK auto-sidecar options can express Electron desktop launch needs.
- [ ] SDK provider rejects stale discovery records by launch context.
- [ ] SDK provider starts packaged binary or packaged Python targets from
      explicit launch options.
- [ ] SDK provider starts dev sidecar through the repo env wrapper or explicit
      Python path without losing `WINDIE_PYTHON_PATH`.
- [ ] SDK `SidecarDaemonHttpClient` remains the only sidecar daemon HTTP/RPC
      client used by `WindieClient`.
- [ ] Electron `WindieClient` construction no longer passes `ensureLocalRuntime`
      for sidecar startup.
- [ ] `ensureDaemonBackedLocalRuntime()` is deleted.
- [ ] Electron duplicate daemon RPC client is deleted or reduced to non-RPC host
      helpers.
- [ ] Local backend readiness UI still reaches renderer.
- [ ] Conversation metadata invalidation still reaches renderer.
- [ ] Local tool execution, screenshot attachment materialization, and display
      bounds behavior still work.
- [ ] Chat conversation listing returns stored conversations in desktop startup.
- [ ] Semantic summarizer daemon launch context still includes active auth and
      backend env.
- [ ] No data migration is required; this changes process/runtime ownership, not
      persisted schemas.
- [ ] Docs and changelog updated.
- [ ] Focused tests pass.
- [ ] Fresh inspection finds no remaining in-scope duplicate sidecar runtime
      client.

## Success Criteria

- Desktop and SDK examples use the same sidecar ownership model:
  `WindieClient.wakeUp(...)` starts/reuses the SDK-owned local runtime.
- Electron main supplies launch options and host lifecycle hooks only; it does
  not implement sidecar daemon HTTP/RPC behavior for SDK-owned features.
- The dashboard recent-chat list no longer goes empty because of raw JSON-RPC
  envelope drift.
- Semantic memory summarization still uses a daemon launched with the active
  backend/auth environment.
- Packaged and dev sidecar startup remain deterministic.
- Search evidence shows no Electron path remains that can pass a custom
  daemon-backed local runtime into the SDK.

## Validation Commands

Focused validation:

```bash
cd frontend && npm run test -- WindieSdkClient LocalBackendBridge.lifecycle LocalBackendBridge.rpc SidecarDaemonManager RuntimePaths IpcMainSdkRuntimeBoundary --runInBand
```

SDK build:

```bash
cd packages/windie-sdk-js && npm run build
```

Sidecar/runtime smoke validation:

```bash
./scripts/python-in-env sidecar python -c "import aiohttp; print(aiohttp.__version__)"
bin/windie docs list
git diff --check
```

If implementation touches sidecar Python or memory behavior:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_chat_event_store.py tests/sidecar/test_memory_summarizer.py -q
```

Manual desktop smoke after focused tests:

```bash
bin/windie start dev
```

Then verify:

- sidecar daemon starts once
- `local-backend-status` becomes ready
- dashboard recent chats load
- Memory panel counts still load
- semantic summarizer status is visible in sidecar `/status`
- a local tool call still executes and returns through the SDK

## Risks And Mitigations

- Risk: SDK auto-sidecar currently lacks packaged launch resolution.
  Mitigation: pass explicit command/args/script/env from Electron helper first;
  do not make SDK import Electron modules.
- Risk: deleting Electron daemon manager breaks readiness UI.
  Mitigation: define readiness as SDK local-runtime availability and subscribe
  through SDK local runtime status/events.
- Risk: tool execution currently depends on Electron display/window shaping.
  Mitigation: keep host argument shaping and `localToolLifecycle`; only move the
  sidecar client/protocol owner to SDK.
- Risk: stale daemon replacement regresses semantic summarizer auth context.
  Mitigation: port launch-context comparison and test mismatched auth path.
- Risk: CJS output drifts from TypeScript source.
  Mitigation: run `cd packages/windie-sdk-js && npm run build` and include CJS
  files in the implementation diff if this repo commits built SDK output.

## No-Migration Note

No SQLite, FAISS, install-auth, settings, or renderer persisted-data migration
is expected. This plan changes the process/runtime ownership path for starting
and talking to the existing sidecar daemon. Existing `chat_events`, memory rows,
semantic indexes, install auth, and frontend settings should remain readable.
