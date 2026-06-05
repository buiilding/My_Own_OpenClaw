---
summary: "Plan for Windows-first runtime cleanup, documentation repair, and removal of compatibility, fallback, and legacy paths."
read_when:
  - When executing or reviewing the Windows-first runtime and legacy cleanup effort.
  - When deciding whether a remaining compatibility, fallback, or platform-specific path should be deleted, isolated, or documented as intentional.
title: "Windows-First Runtime and Legacy Cleanup Plan"
---

# Windows-First Runtime and Legacy Cleanup Plan

## User Intent

The user wants a plan before code changes to clean up WindieOS across code and
docs, update stale architecture references, remove compatibility/fallback/legacy
paths, and make Windows a first-class development and runtime target. The plan
must respect the current target architecture: backend owns model truth, SDK owns
reusable runtime truth, Electron main owns desktop host policy, renderer owns
display/user intent, preload owns the narrow bridge, and the Python sidecar owns
local machine authority.

## Current Architectural Direction

Recent commits confirm the intended direction:

- `c90c14018 refactor(frontend): route conversation history through sdk commands`
- `2237d8a3e refactor(frontend): retire legacy sdk ipc channels`
- `3b82937a2 refactor(frontend): route live turn through sdk invoke`
- `59f3d230b refactor(frontend): route renderer commands through sdk invoke`
- `47a180ffd refactor(frontend-chat): move minimal pill to sdk-owned surface`

The next cleanup should continue this direction instead of restoring old
Electron-only or renderer-owned runtime behavior.

## Architectural Change Concept

This is a cleanup and convergence project, not a feature addition. The goal is
to make the codebase simpler by deleting retired runtime paths and isolating
platform-specific behavior where it belongs.

Conceptual target:

- Backend remains the only owner of model-facing prompt, provider, tool-policy,
  remote-tool, compaction, and backend-history semantics.
- SDK remains the only reusable owner of websocket lifecycle, conversation
  commands, normalized events, display/rehydrate projections, tool-result
  return, retry/edit semantics, and conversation stores.
- Electron main remains a host around SDK runtime plus native desktop policy:
  windows, overlays, endpoint selection, install auth, IPC allowlists,
  permissions, screenshot/window policy, sidecar startup, and wakeword startup.
- Renderer feature code expresses user intent through SDK-shaped runtime
  facades and renders SDK projections. It does not interpret raw backend
  packets, call sidecar storage RPCs for user-facing concepts, or keep replay
  fallbacks.
- Preload exposes explicit allowlisted host commands. Generic bridge usage
  remains only where a host/native command has not yet been migrated, and every
  remaining case is classified.
- Python sidecar owns local execution and local persistence mechanics. It does
  not import backend code or encode provider/model-facing policy.
- Windows, macOS, and Linux differences live in platform modules, launch
  adapters, path normalizers, process policies, and sidecar/browser/screenshot
  implementations, not in chat/runtime/business logic.

## Problems To Audit

1. Windows-host assumptions:
   - POSIX paths, slash handling, `~`, `/tmp`, colon-separated env paths, or
     unescaped spaces in paths.
   - Bash-only script examples or runtime commands used from Windows.
   - Process spawning that relies on macOS shell behavior, executable lookup,
     detached process semantics, or signal behavior.
   - Python sidecar and wakeword startup paths that assume macOS resource
     layout or shell quoting.
   - Browser launch/attach, screenshot, window focus, topmost, and permission
     policies that have undocumented Windows behavior.

2. Legacy runtime paths:
   - Direct renderer use of retired SDK-owned `windie:*` runtime channels.
   - Raw backend event subscriptions used as live chat state fallbacks.
   - Sidecar RPC names leaking into renderer features for SDK concepts.
   - Compatibility aliases for conversation refs, turn ids, tool ids, or
     payload fields after the boundary where they should be canonical.
   - Duplicate transcript, replay, compaction, or conversation-store
     interpretation outside SDK projections/store adapters.

3. Stale docs and navigation:
   - `./bin/docs-list` currently reports `docs/docs.json` missing-page entries
     in this Windows checkout; this must be resolved or documented with a
     concrete generator/path reason.
   - Old architecture references that describe retired direct IPC or renderer
     ownership paths.
   - Mac-only setup/run instructions without Windows equivalents.
   - Deep reference pages that preserve old paths without a deletion condition.

## Out Of Scope

- Changing model/provider behavior or model-visible tool schemas unless an audit
  proves a legacy compatibility path is corrupting the contract.
- Broad UI redesign, new product features, or new extension systems.
- Release version changes, publishing, signing, or notarization.
- Rewriting the whole Electron main process or SDK in one patch.
- Removing generic `window.ipc.invoke(...)` in the first slice unless the audit
  proves all host/native callers have explicit replacements ready.
- Deleting platform-specific behavior that is required and already isolated
  behind a real OS boundary.

## Ordered Plan

### Phase 1: Inventory And Classification

- Rerun orientation from a clean Windows checkout:
  - `./bin/docs-list`
  - `git status --short --branch`
  - recent `git log`/`git show` for SDK, Electron main, sidecar, docs, and
    scripts touched by the cleanup.
- Build a live-code inventory for:
  - direct `windie:*` runtime channel usage
  - generic `window.ipc.invoke(...)` usage
  - raw backend stream subscriptions
  - sidecar chat/history/storage RPC names in renderer code
  - compatibility/fallback/legacy naming in SDK/main/renderer/store code
  - platform checks and path/process/shell launch code
  - Mac-only commands in docs and scripts
- Classify each finding as one of:
  - delete now
  - migrate to SDK-shaped command
  - keep as Electron-native host command
  - keep as SDK/local-runtime adapter
  - keep as real platform boundary
  - defer with explicit deletion condition

### Phase 2: Windows Platform Boundary Cleanup

- Normalize Windows-sensitive host behavior at the owning boundary:
  - Electron main for process launch, app paths, bundled resources,
    sidecar/wakeword supervision, IPC, permissions, windows, overlays, and
    screenshot policy.
  - Python sidecar for filesystem, shell/process sessions, browser mechanics,
    local memory, and local tool execution.
  - SDK for runtime command payloads, local-runtime coordination, and normalized
    store/projection behavior.
- Replace shell-shaped assumptions with structured Node/Python APIs where
  feasible.
- Keep command-shell selection explicit when shell execution is required.
- Add or tighten tests for Windows path/process behavior without making
  renderer or backend code branch on Windows-specific details.

### Phase 3: Runtime Legacy Removal

- Delete or migrate remaining SDK-owned direct runtime channels and handlers.
- Remove renderer fallbacks that interpret raw backend events as chat truth.
- Remove redundant renderer stores/loaders that duplicate SDK
  conversation-store or projection behavior.
- Collapse compatibility aliases after canonical fields are normalized at the
  runtime boundary.
- Keep any remaining compatibility path only if it has:
  - a verified live dependency
  - a named owner
  - a test that proves why it remains
  - a deletion condition in the matching report

### Phase 4: Docs Cleanup And Navigation Repair

- Fix `docs/docs.json` / docs-list navigation drift so `./bin/docs-list` passes
  on Windows.
- Update architecture docs to state current boundaries, not retired migration
  history.
- Update Windows setup/run/test instructions wherever commands are Mac-only.
- Remove stale references to deleted channels, stores, fallbacks, helpers, or
  compatibility exports.
- Keep durable migration debt only in plan/report files or docs sections with
  explicit deletion conditions.

### Phase 5: Validation And Commit

- Run focused tests for every touched boundary.
- Run `./bin/docs-list` and `git diff --check`.
- Run broader checks when the change crosses SDK/Electron/sidecar boundaries.
- Update `CHANGELOG.md` for repo-visible behavior/docs cleanup.
- Commit the completed approved implementation with a Conventional Commit and a
  body that explains previous behavior, fix, current behavior, and validation.
- Maintain a matching report file under `docs/plans/` during execution and
  record each commit, validation command, deviation, blocker, and intentional
  debt item.

## Checklist

- [ ] User approves this plan before implementation starts.
- [ ] Create matching execution report under `docs/plans/`.
- [ ] Rerun docs/code orientation on Windows.
- [ ] Inspect recent commits for every subsystem touched.
- [ ] Build and record the compatibility/fallback/platform inventory.
- [ ] Classify each finding by owner and action.
- [ ] Fix docs-list navigation drift or document the exact generator/path issue
      if it is blocked.
- [ ] Remove or migrate in-scope legacy SDK runtime command paths.
- [ ] Remove or migrate in-scope renderer raw-backend or sidecar-RPC fallbacks.
- [ ] Isolate Windows-specific path/process/platform behavior at the owning
      boundary.
- [ ] Update docs and `read_when` hints for changed boundaries.
- [ ] Update `CHANGELOG.md`.
- [ ] Run focused validation commands.
- [ ] Run `./bin/docs-list`.
- [ ] Run `git diff --check`.
- [ ] Commit completed work without staging unrelated files.
- [ ] Update the report with commits, validation, deviations, and remaining
      debt.

## Success Criteria

- Windows local development commands and runtime startup paths are documented
  and validated for the touched surfaces.
- No renderer feature/app path uses retired direct SDK-owned `windie:*` runtime
  channels.
- No renderer feature/app path calls sidecar chat/history/storage RPC names for
  user-facing SDK concepts.
- Remaining generic IPC usage is classified as Electron-native host behavior,
  SDK/local-runtime adapter internals, or explicitly deferred with a deletion
  condition.
- Raw backend event paths are debug/diagnostic or typed side-channel inputs, not
  live conversation truth.
- SDK projection/store helpers remain the owner of display, rehydrate, retry,
  edit/resend, compaction, and conversation event interpretation.
- Platform differences are isolated in Electron main, sidecar, packaging, or
  SDK local-runtime adapters rather than scattered through UI features.
- `./bin/docs-list` passes, or the report records a concrete blocker that is
  outside the approved implementation scope.
- Focused tests cover each changed runtime boundary.
- The final report explains previous behavior, implementation, current
  behavior, validation, and intentionally remaining debt.

## Validation Commands

Exact commands may be narrowed after inventory, but the expected validation set
is:

```powershell
./bin/docs-list
git diff --check
cd frontend; npm run test -- IpcChannels.test.ts PreloadIpcChannels.test.cjs IpcMainSdkRuntimeBoundary.test.cjs RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts
cd frontend; npm run test -- DesktopBackendTransport.test.ts DesktopLiveTurnRuntimeClient.test.ts DesktopConversationContinuityService.test.ts DesktopConversationLibraryClient.test.ts DesktopSettingsRuntimeClient.test.ts
cd packages/windie-sdk-js; npm run build
./scripts/python-in-env sidecar pytest tests/sidecar/test_shell_process_tool.py tests/sidecar/test_shell_process_registry.py tests/sidecar/test_read_file_tool.py tests/sidecar/test_replace_tool.py
```

Additional validation should be added if the implementation touches:

- Electron sidecar/wakeword process supervision.
- Browser automation or screenshot/window policy.
- Backend tool schema, policy, result ingestion, or rehydrate contracts.
- Packaging/resource lookup.
- Public SDK examples.

## Assumptions

- The cleanup will be implemented in small slices rather than one massive
  rewrite.
- The current SDK-shaped runtime direction is correct and should be preserved.
- Windows behavior should be validated from this checkout, while macOS behavior
  should be preserved through platform-policy tests and existing docs.
- Compatibility paths should be deleted unless a real runtime, security,
  lifecycle, storage, or platform boundary justifies keeping them.
- If implementation needs to cross a larger public contract boundary than this
  plan anticipates, the report will pause that item and the plan will be updated
  before proceeding.
