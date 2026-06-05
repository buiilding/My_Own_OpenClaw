# Minimal Chat Pill SDK Ownership Cleanup Report

## Plan

- Plan file: `docs/plans/2026-06-05-minimal-chat-pill-sdk-ownership-cleanup-plan.md`
- Implementation commit already on `main`: `47a180ffd refactor(frontend-chat): move minimal pill to sdk-owned surface`
- Follow-up scope: restore plan/report compliance, remove remaining synthetic local user message compatibility, fix query-send failure broadcasting, and align focused tests with the SDK-owned runtime path.

## Outcome

- Electron main forwards SDK conversation snapshots instead of rebuilding live rows from single events.
- The minimal chat pill and response overlay remain the existing UI implementation, now grouped under the `minimalChatPill` renderer feature.
- Renderer send paths go through Electron IPC into the SDK `ConversationRuntime` rather than a renderer-owned runtime adapter.
- Active-loop overlay phase handling no longer owns blanket click-through/content-protection policy; those policies are owned by SDK local-tool lifecycle leases in Electron main.
- Synthetic local user message broadcasting was removed from query preparation. SDK `ConversationRuntime.send()` is now the source of `turn_started` and `user_message`.
- Query-send failures now use the current `broadcastToRenderers(channel, payload)` contract and include SDK-normalizable event identity, so renderers receive a `turn_error` instead of silently missing the failure.
- SDK `ConversationRuntime.send()` now rejects when a transport reports that a query was not sent instead of falling back to the turn id and reporting success.
- Follow-up documentation now points current guides and runtime maps at
  `WindieClient.wakeUp(...)`, `agent.conversation(...)`, SDK snapshots, scoped
  Electron surface leases, and the `minimalChatPill` renderer feature instead
  of the removed desktop wrapper, synthetic local echo path, or legacy chatbox
  overlay routes.

## Deviations

- The main implementation commit was created before this report file existed because the work was interrupted by a direct "commit first" request. This report records the already-landed implementation and the follow-up fixes needed to comply with the new `AGENTS.md` plan/report rule.
- The original plan expected the SDK-first lifecycle hook to be added. Live inspection showed that hook already existed, so the implementation focused on deleting old parallel UI/runtime policies and stale compatibility paths.
- `buildLocalUserMessage` was deleted from `ipc_query_events.cjs` after its last Electron query-preparation call site was removed.

## Validation

- `./bin/docs-list` passed before the implementation commit and again after this follow-up report.
- `cd frontend && npm run test:ci -- IpcMainBridge.query.test.cjs IpcQuerySendRuntime.test.cjs ChatBoxResponse.state.test.jsx IpcMainSdkRuntimeBoundary.test.cjs WindieSdkConversationRuntime.test.ts` passed after the follow-up fixes.
- `cd frontend && npm run test:ci -- DesktopLiveTurnRuntimeClient.test.ts ChatBoxOverlayMouseIgnore.test.jsx ChatBoxResponse.state.test.jsx ChatBoxPillLayout.test.js ChatBoxPreviewRemoval.test.js ResponseOverlayPhaseHandler.test.cjs SurfaceRuntime.test.cjs LocalBackendBridgeExtensionRuntime.test.cjs MainWindowRuntime.test.cjs MainWindowOverlayRuntime.test.cjs IpcMainSdkRuntimeBoundary.test.cjs IpcMainBridge.query.test.cjs IpcMainBridge.lifecycle.test.cjs IpcQuerySendRuntime.test.cjs WindieSdkConversationRuntime.test.ts AppConfigProvider.models.test.tsx AppConfigProvider.storageAndIpc.test.tsx DesktopSettingsRuntimeClient.test.ts` passed: 18 suites, 340 tests. Jest printed the existing open-handle warning after completion.
- `git diff --check -- CHANGELOG.md docs/plans/2026-06-05-minimal-chat-pill-sdk-ownership-cleanup-report.md frontend/src/main/ipc.cjs frontend/src/main/ipc/ipc_query_broadcast.cjs frontend/src/main/ipc/ipc_query_events.cjs frontend/src/main/ipc/ipc_query_send_runtime.cjs packages/windie-sdk-js/src/runtime/ConversationRuntime.ts packages/windie-sdk-js/cjs/runtime/ConversationRuntime.js tests/frontend/ChatBoxResponse.testUtils.jsx tests/frontend/IpcMainBridge.query.test.cjs tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs tests/frontend/IpcQuerySendRuntime.test.cjs tests/frontend/WindieSdkConversationRuntime.test.ts` passed.
- Current docs follow-up validation:
  - `./bin/docs-list` passed.
  - `git diff --check` passed.
  - `cd frontend && npm run test:ci -- MainWindowRuntime.test.cjs MainWindowOverlayRuntime.test.cjs IpcMainBridge.query.test.cjs IpcMainBridge.lifecycle.test.cjs IpcQuerySendRuntime.test.cjs IpcMainSdkRuntimeBoundary.test.cjs WindieSdkConversationRuntime.test.ts AppConfigProvider.models.test.tsx AppConfigProvider.storageAndIpc.test.tsx DesktopSettingsRuntimeClient.test.ts` passed: 10 suites, 247 tests. Jest printed the existing open-handle warning after completion.
  - Stale-reference checks for `WindieAgent.startDesktop`, `WindieDesktopAgent`, `buildLocalUserMessage`, `buildDisplayRows([event])`, old overlay routes, and old `ChatBoxApp`/`ChatBoxResponseApp` names passed for active docs/source; remaining `view=chatbox-context-label` hits are the still-live context-label route.

## Remaining Follow-Up

- Keep unrelated dirty files out of the commit: `examples/simple-chat-cli/run.mjs` and `TASK.md`.
