---
summary: "Execution report for the Windows-first runtime cleanup, documentation repair, and legacy path removal plan."
read_when:
  - When reviewing implementation status for the Windows-first runtime and legacy cleanup effort.
  - When continuing or auditing the approved Windows-first cleanup plan.
title: "Windows-First Runtime and Legacy Cleanup Report"
---

# Windows-First Runtime and Legacy Cleanup Report

Plan: [Windows-First Runtime and Legacy Cleanup Plan](2026-06-05-windows-first-runtime-and-legacy-cleanup-plan.md)

## Status

Implementation complete for the first approved cleanup slice. The slice fixed
Windows docs-list navigation validation, made the frontend Jest command
PowerShell-compatible, normalized one existing boundary test for Windows path
separators, refreshed active SDK-shaped IPC/query docs, and documented Windows
local development command expectations.

## Orientation Log

- `git status --short --branch`: clean `main...origin/main` plus the new plan
  file before implementation.
- `./bin/docs-list`: failed on Windows. It printed the docs listing, then
  reported many `docs/docs.json` entries as missing even though entries such as
  `docs/getting-started/docs_directory.md` exist in the checkout.
- Recent commits confirm the current direction is SDK-shaped renderer commands,
  direct Electron-main `WindieClient.wakeUp(...)`, and deletion of legacy SDK
  IPC channels:
  - `c90c14018 refactor(frontend): route conversation history through sdk commands`
  - `2237d8a3e refactor(frontend): retire legacy sdk ipc channels`
  - `3b82937a2 refactor(frontend): route live turn through sdk invoke`
  - `59f3d230b refactor(frontend): route renderer commands through sdk invoke`

## Inventory And Classification

- Direct retired SDK-owned runtime channel usage:
  - `rg` found no active `frontend/src` or SDK usage of the retired direct
    runtime handler family.
  - Remaining hits are negative boundary-test strings in
    `RendererAppRuntimeBoundary.test.ts`.
  - Classification: no live code action required.
- Sidecar chat/history/storage RPC names:
  - Active renderer feature/app source does not call sidecar-shaped
    conversation storage channels for user-facing SDK concepts.
  - `SidecarConversationStore` still calls `get_chat_events` below the SDK
    store/local-runtime boundary.
  - Main/sidecar contract docs still document these names as internal
    sidecar/SDK-store channels.
  - Dashboard test mocks still adapt SDK-shaped commands to sidecar-shaped
    fixture data.
  - Classification: keep as SDK/local-runtime adapter or test-harness
    compatibility; no active renderer feature leak found.
- Generic `IpcBridge.invoke(...)` usage:
  - Remaining renderer usage is host/native behavior such as window controls,
    permissions, artifact upload/fetch, local backend status, browser control,
    screenshot attachment capture, frontend config, and the single
    `WINDIE_INVOKE` adapter.
  - Classification: keep as Electron-native host command surface for this
    slice.
- Raw backend events:
  - Renderer-owned paths do not subscribe to `ON_CHANNELS.FROM_BACKEND`.
  - `agent.subscribeRawBackendEvents(...)` remains in SDK/main as explicit debug
    and lifecycle handling.
  - Classification: keep as debug/main-owned event hook.
- Windows platform assumptions:
  - `./bin/docs-list` failed because discovered markdown paths used Windows
    backslashes while navigation paths were normalized with forward slashes.
  - `npm.cmd run test -- ...` failed because the frontend `test` script used
    Unix-style `NODE_OPTIONS=...` assignment.
  - Existing `RendererAppRuntimeBoundary.test.ts` failed on Windows because it
    compared `path.relative(...)` backslash paths to forward-slash allowlists.
  - Classification: fix now.
- Stale active docs:
  - Several active architecture/frontend docs still described retired direct
    chat runtime IPC channels as live handlers.
  - Classification: update now.

## Implementation Notes

- `scripts/docs-list.js`
  - Normalized discovered markdown file paths with forward slashes before
    comparing them to `docs/docs.json`.
  - Wrapped executable behavior in `main()` and exported helpers for focused
    tests.
- `scripts/doc-lists.js`
  - Calls `docs-list.js` `main()` explicitly after `docs-list.js` stopped
    executing on import.
- `tests/frontend/DocsListScript.test.cjs`
  - Added a Windows path-separator regression test for docs-list navigation.
- `frontend/scripts/jest-runner.cjs` and `frontend/package.json`
  - Replaced Unix-only `NODE_OPTIONS=--no-deprecation jest ...` scripts with a
    Node launcher that sets `NODE_OPTIONS` cross-platform and invokes Jest.
- `tests/frontend/RendererAppRuntimeBoundary.test.ts`
  - Normalized relative paths before comparing with forward-slash allowlists so
    runtime boundary checks work on Windows.
- Active docs
  - Replaced stale direct runtime IPC language with SDK-shaped
    `windie:invoke` command language.
  - Documented Windows `npm.cmd` use for PowerShell execution-policy cases.
  - Documented Windows packaging's Bash requirement for the sidecar runtime
    build script.

## Checklist

- [x] User approved the plan before implementation started.
- [x] Create matching execution report under `docs/plans/`.
- [x] Rerun docs/code orientation on Windows.
- [x] Inspect recent commits for every subsystem touched.
- [x] Build and record the compatibility/fallback/platform inventory.
- [x] Classify each finding by owner and action.
- [x] Fix docs-list navigation drift or document the exact generator/path issue
      if it is blocked.
- [x] Remove or migrate in-scope legacy SDK runtime command paths.
- [x] Remove or migrate in-scope renderer raw-backend or sidecar-RPC fallbacks.
- [x] Isolate Windows-specific path/process/platform behavior at the owning
      boundary.
- [x] Update docs and `read_when` hints for changed boundaries.
- [x] Update `CHANGELOG.md`.
- [x] Run focused validation commands.
- [x] Run `./bin/docs-list`.
- [x] Run `git diff --check`.
- [x] Commit completed work without staging unrelated files.
- [x] Update the report with commits, validation, deviations, and remaining
      debt.

## Success Criteria

- [x] Windows local development commands and runtime startup paths are
      documented and validated for the touched surfaces.
- [x] No renderer feature/app path uses retired direct SDK-owned `windie:*`
      runtime channels.
- [x] No renderer feature/app path calls sidecar chat/history/storage RPC names
      for user-facing SDK concepts.
- [x] Remaining generic IPC usage is classified as Electron-native host
      behavior, SDK/local-runtime adapter internals, or explicitly deferred with
      a deletion condition.
- [x] Raw backend event paths are debug/diagnostic or typed side-channel inputs,
      not live conversation truth.
- [x] SDK projection/store helpers remain the owner of display, rehydrate,
      retry, edit/resend, compaction, and conversation event interpretation.
- [x] Platform differences are isolated in Electron main, sidecar, packaging,
      or SDK local-runtime adapters rather than scattered through UI features.
- [x] `./bin/docs-list` passes, or this report records a concrete blocker that
      is outside the approved implementation scope.
- [x] Focused tests cover each changed runtime boundary.
- [x] Final report explains previous behavior, implementation, current
      behavior, validation, and intentionally remaining debt.

## Validation Log

- `./bin/docs-list`: failed before implementation on Windows because
  `docs/docs.json` page refs used forward slashes while discovered markdown
  files used backslashes.
- `./bin/docs-list`: passed after `docs-list` path normalization; canonical
  navigation validated 81 page references.
- `cd frontend; npm.cmd run test -- DocsListScript.test.cjs RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts PreloadIpcChannels.test.cjs`: failed before test-script fix because `NODE_OPTIONS=...` in `frontend/package.json` is Unix shell syntax and is not recognized by Windows `cmd`.
- `$env:NODE_OPTIONS='--no-deprecation'; node node_modules/jest/bin/jest.js --config jest.config.cjs DocsListScript.test.cjs RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts PreloadIpcChannels.test.cjs`: failed once because `RendererAppRuntimeBoundary.test.ts` compared Windows backslash relative paths to forward-slash allowlists; passed after path normalization, 4 suites / 48 tests.
- `cd frontend; npm.cmd run test -- DocsListScript.test.cjs RendererAppRuntimeBoundary.test.ts RendererChatRuntimeBoundary.test.ts PreloadIpcChannels.test.cjs`: passed after replacing the npm test script with `frontend/scripts/jest-runner.cjs`, 4 suites / 48 tests.
- `./bin/docs-list`: passed in the final verification pass; canonical
  navigation validated 81 page references.
- `git diff --check`: passed in the final verification pass. Git emitted
  Windows line-ending conversion warnings for touched text files, but no
  whitespace errors.

## Commits

- `fix(windows): normalize docs and test commands` records this implementation
  slice. The commit is created after this report update is staged; the final
  response records the resulting hash.

## Decisions, Tradeoffs, Blockers, Deviations

- This slice did not remove generic `window.ipc` / `IpcBridge.invoke` usage.
  Remaining active renderer uses are host/native or local authority surfaces
  such as windows, permissions, artifact IO, screenshots, browser control,
  frontend config, and the single SDK command adapter.
- This slice did not remove sidecar chat-event RPC names from
  `SidecarConversationStore`, main local-backend mapper docs, or sidecar docs.
  They remain below the SDK/local-runtime boundary and are not user-facing
  renderer commands.
- Sidecar tests were not run because sidecar execution/storage behavior did not
  change. The changed surfaces are docs-list, frontend npm test launching,
  renderer boundary test path normalization, and documentation.
