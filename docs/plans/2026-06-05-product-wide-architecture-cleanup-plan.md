---
summary: "Product-wide cleanup campaign plan for removing legacy, fallback, compatibility, and duplicated ownership paths across WindieOS."
read_when:
  - When executing or reviewing the product-wide architecture cleanup campaign.
  - When deciding whether a compatibility, fallback, legacy, or duplicated runtime path should be deleted, isolated, or carried forward with an explicit owner.
title: "Product-Wide Architecture Cleanup Plan"
---

# Product-Wide Architecture Cleanup Plan

## User Intent

The user wants the broader product-wide cleanup, not only the Windows-first
slice. The goal is to clean code and docs across WindieOS, remove legacy,
fallback, compatibility, and duplicated ownership paths, and keep Windows as a
first-class development/runtime target while preserving the current target
architecture.

This is a deletion-first architecture campaign. It should remove duplicated
authorities instead of adding new wrapper layers that leave old paths alive.

## Target Architecture

- Backend owns model truth: prompt construction, provider routing, model-facing
  tool policy, hosted APIs, artifacts, OCR/vision, compaction, and backend
  history.
- SDK owns reusable runtime truth: backend websocket lifecycle, query commands,
  normalized conversation events, current-turn/display projections, local-tool
  correlation, result return, conversation stores, replay, rehydrate, edit, and
  retry.
- Electron main owns desktop host policy: windows, overlays, menus, app
  lifecycle, endpoint diagnostics, native permissions, sidecar/wakeword process
  supervision, IPC registration, and direct `WindieAgent.startDesktop(...)`
  customer wiring.
- Renderer owns user-facing state and display only: dashboard, chat, settings,
  voice, permissions UI, transcript projection display, and display-only tool
  state.
- Preload owns the narrow allowlisted renderer bridge.
- Python sidecar owns local authority: filesystem, shell, browser, computer
  control, local memory/storage, system state, and sidecar executable tools.
- Docs and tests own durable contracts, deletion conditions, routing maps, and
  regression evidence.

## Orientation Summary

- `./bin/docs-list` passes on Windows after the previous cleanup commit.
- `docs/docs.json` and `docs/getting-started/docs_directory.md` route this work
  through runtime model, runtime boundary, data-flow/state ownership, code
  change surface, frontend, SDK, sidecar, tools, security, and packaging docs.
- Recent commits confirm the SDK-first direction:
  - `c90c14018 refactor(frontend): route conversation history through sdk commands`
  - `2237d8a3e refactor(frontend): retire legacy sdk ipc channels`
  - `3b82937a2 refactor(frontend): route live turn through sdk invoke`
  - `59f3d230b refactor(frontend): route renderer commands through sdk invoke`
  - `289fd8cb6 refactor(sdk): host desktop runtime through wakeUp`
- Existing refactor docs show most prior checklist items are complete. The
  largest remaining source-owned item is the local backend bridge split, with
  adjacent cleanup around typed event channels, diagnostics, contract schema
  validation, and platform script parity.

## Architectural Change Concept

This campaign converges each product surface onto one source of truth:

- Query and conversation behavior flows through SDK commands and SDK
  projections, not raw renderer/backend/sidecar fallback paths.
- Local sidecar behavior is hosted through focused Electron-main modules and
  SDK local-runtime adapters, not one large bridge that owns process lifecycle,
  RPC transport, status, tool host behavior, and method mapping together.
- Renderer feature code stops seeing sidecar RPC names, raw backend event names,
  backend payload internals, or native host command policy except through
  explicit runtime clients.
- Backend compatibility/fallback behavior remains only where it is provider,
  persisted-data, or external-client required; every retained fallback gets an
  owner, reason, deletion condition, and test target.
- Windows/macOS/Linux differences live in platform, packaging, path/process, or
  sidecar modules, with docs and tests that prove the boundary.

## Out Of Scope

- No version changes, publishing, notarization, installer release, or production
  deployment.
- No destructive migration of user databases or persisted configs without a
  separate storage migration plan.
- No dependency replacement, vendored dependency edits, or `node_modules` /
  bundled runtime edits.
- No backend prompt/provider rewrite unless a cleanup finding proves duplicated
  authority in the touched path.
- No compatibility shim is added unless a verified external client, persisted
  data shape, or provider contract requires it.
- No branch switch or push unless the user asks.

## Ordered Plan

### Phase 0: Create Report And Product-Wide Inventory

1. Create the matching report under `docs/plans/`.
2. Re-run `./bin/docs-list`, `git status`, and recent `git log` checks.
3. Inventory source-only legacy/fallback/compatibility hits across:
   - backend prompt/provider/tool/history/API surfaces
   - SDK runtime, projection, store, and local-tool surfaces
   - Electron main IPC, local-backend bridge, sidecar process, platform, and
     packaging surfaces
   - renderer feature/app/runtime surfaces
   - Python sidecar local tools, memory, browser, system, and shell surfaces
   - tests and active docs
4. Classify every finding as delete now, isolate now, keep with owner, or
   defer with deletion condition.
5. Record the inventory in the report before code edits beyond the report.

### Phase 1: Split Local Backend Bridge Ownership

1. Inspect recent commits and tests around `local_backend_bridge.cjs`,
   `sidecar_daemon_manager.cjs`, bridge request transport, RPC mappers, tool
   execution runtime, and status broadcasting.
2. Extract process lifecycle/supervision into one owned module or confirm the
   existing supervisor fully owns it.
3. Extract JSON-RPC request transport and stdout/event parsing into a transport
   module with tests.
4. Extract RPC method mapping into one registry so camelCase/snake_case and
   alias handling cannot spread.
5. Extract status broadcasting/readiness updates into one status owner.
6. Keep tool execution policy in SDK/local-tool coordinator plus Electron host
   adapter; delete bridge catch-all helper paths that become unused.
7. Add focused tests for lifecycle failures, RPC failures, status transitions,
   mapper normalization, and local tool dispatch through the new boundaries.

### Phase 2: Type Remaining Renderer Event And Settings Channels

1. Classify every renderer subscription to raw backend or SDK fan-out channels
   as display projection, side effect, diagnostics, or migration debt.
2. Move settings/model capability events to typed settings/model runtime
   clients when active UI still depends on raw backend traffic.
3. Keep `windie:conversation-event` only as SDK-normalized conversation event
   fan-out, not as a backend raw event alias.
4. Add or tighten boundary tests so chat live state cannot consume
   `ON_CHANNELS.FROM_BACKEND` or sidecar RPC names.
5. Update docs that blur current behavior, target behavior, and remaining debt.

### Phase 3: Diagnostics And Logging Boundary

1. Inventory frontend and main-process ad hoc interaction logs, debug stream
   traces, and message-content logging paths.
2. Create or tighten one diagnostics runtime with explicit dev/diagnostic
   gating and redaction rules.
3. Route feature logs through the diagnostics runtime or delete low-value logs.
4. Add tests proving production/default behavior does not log message text or
   credentials.

### Phase 4: Cross-Runtime Contract Tests

1. Add test-only schema artifacts or exact key snapshots for backend websocket
   payloads without importing backend Python into frontend runtime.
2. Validate frontend/SDK query, stop, settings, list-models, rehydrate,
   compact-history, tool-result, and bundle-result payloads against those
   contracts.
3. Delete frontend test expectations that preserve invalid or retired backend
   payload fields.
4. Document envelope fields versus payload fields.

### Phase 5: Platform And Script Parity

1. Audit source and packaging scripts for Bash-only assumptions that are used by
   Windows docs or package scripts.
2. Add Windows-native wrappers or document explicit Bash requirements where the
   script truly remains Bash-owned.
3. Normalize repo-relative path handling at script boundaries.
4. Add tests for Windows path separators and command launcher behavior where
   practical.

### Phase 6: Backend And Sidecar Retained Fallback Review

1. Review backend provider, token, prompt, history, tool-result, and rehydrate
   fallback paths.
2. Review sidecar system/browser/screenshot/shell fallback paths.
3. Delete fallback behavior that only supports already-removed payload shapes.
4. Preserve provider, platform, or persisted-data fallbacks only with explicit
   docs, tests, and deletion conditions.

### Phase 7: Docs, Changelog, Validation, And Commits

1. Update active architecture docs to distinguish current behavior, target
   behavior, known debt, and deletion condition.
2. Update `CHANGELOG.md` for every repo-visible behavior or validation change.
3. Run focused backend, sidecar, frontend, SDK, docs, and diff checks.
4. Commit in small Conventional Commit slices with required body sections.
5. Update the report after every commit with the commit id, validation, and any
   deviations.

## Checklist

- [ ] User approves this product-wide plan before implementation starts.
- [ ] Create matching execution report under `docs/plans/`.
- [ ] Complete source-only inventory and classify findings.
- [ ] Split local backend bridge ownership or record concrete blockers.
- [ ] Remove or isolate in-scope renderer raw-event and sidecar-RPC leaks.
- [ ] Tighten diagnostics/logging ownership and redaction policy.
- [ ] Add cross-runtime payload contract tests.
- [ ] Improve Windows/script parity for touched commands and packaging paths.
- [ ] Review backend/sidecar retained fallback behavior and delete stale paths.
- [ ] Update docs and `read_when` hints for changed boundaries.
- [ ] Update `CHANGELOG.md`.
- [ ] Run focused validation for every touched runtime.
- [ ] Run `./bin/docs-list`.
- [ ] Run `git diff --check`.
- [ ] Commit completed work in small slices.
- [ ] Keep the report current with commits, validation, deviations, blockers,
      and intentionally remaining debt.

## Success Criteria

- Each runtime has one clear source of truth for touched behavior.
- Renderer feature code does not interpret raw backend events, call sidecar RPCs
  for SDK-owned concepts, or shape backend websocket payload internals.
- Electron main IPC and local-backend bridge files shrink toward composition
  roots with focused owner modules and tests.
- SDK remains the owner of conversation events, display/current-turn
  projections, local-tool correlation, result return, replay, rehydrate, edit,
  and retry semantics.
- Sidecar remains the owner of local execution/storage, with bridge method
  mapping isolated at the transport boundary.
- Backend remains the owner of prompt/provider/model-facing tool/API/history
  semantics.
- Remaining compatibility/fallback paths are documented with owner, reason,
  deletion condition, and test target.
- Windows development commands and platform-specific runtime behavior are
  documented and covered for every touched surface.
- Validation covers all touched producer/consumer boundaries before each commit.

## Validation Commands

Use focused subsets first, then widen when a phase crosses boundaries.

- `./bin/docs-list`
- `git diff --check`
- `cd frontend; npm.cmd run test -- LocalBackendBridge LocalBackendBridge.rpc LocalBackendBridge.lifecycle --runInBand`
- `cd frontend; npm.cmd run test -- RendererAppRuntimeBoundary RendererChatRuntimeBoundary PreloadIpcChannels IpcMainSdkRuntimeBoundary --runInBand`
- `cd frontend; npm.cmd run test -- DesktopSettingsRuntimeClient AppConfigProvider.models AppConfigProvider.storageAndIpc --runInBand`
- `cd frontend; npm.cmd run test -- WindieSdkClient WindieSdkConversationRuntime WindieSdkManagedBackendSession --runInBand`
- `cd frontend; npm.cmd run typecheck`
- `cd frontend; npm.cmd run lint`
- `cd packages/windie-sdk-js; npm.cmd run build`
- `./scripts/python-in-env backend pytest tests/backend -q`
- `./scripts/python-in-env sidecar pytest tests/sidecar -q`

When a narrower test is sufficient, record the focused command in the report and
explain why broader validation was skipped.

## Assumptions

- The prior Windows cleanup commit remains on `main` and is not pushed unless
  requested.
- The broad cleanup will be implemented as multiple small commits rather than a
  single large commit.
- Any public API, persisted data, provider compatibility, or sidecar wire
  protocol change gets a specific migration/compatibility note before deletion.
- If a phase exposes a larger subsystem rewrite than this plan safely covers,
  the report will mark that item blocked or deferred and a narrower follow-up
  plan will be created before implementation widens.
