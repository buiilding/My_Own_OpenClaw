---
summary: "Realtime execution report for implementing the SDK turn input pipeline refactor."
read_when:
  - When continuing or reviewing the SDK turn input pipeline refactor.
  - When debugging delayed user-row display caused by attachment or screenshot preparation before SDK turn start.
title: "SDK Turn Input Pipeline Refactor Report"
---

# SDK Turn Input Pipeline Refactor Report

Plan: [SDK Turn Input Pipeline Refactor Plan](2026-06-06-sdk-turn-input-pipeline-refactor-plan.md)

Status: complete.

## Intent

Implement the approved refactor so renderer submits user intent and attachment
resource handles immediately, while SDK `ConversationRuntime` owns the staged
turn lifecycle:

- emit base user row immediately
- resolve resources through host capabilities
- merge user row metadata
- assemble model-facing payload
- send backend transport
- settle deterministic failure state

## Checklist

- [x] Create execution report before runtime edits.
- [x] Add SDK tests for base row before delayed resource resolution.
- [x] Add SDK tests for resource metadata merge and failure.
- [x] Add SDK turn input resource/resolver types.
- [x] Implement SDK turn input pipeline.
- [x] Wire Electron desktop resource resolvers.
- [x] Simplify renderer successful send preparation.
- [x] Update renderer/main/SDK tests.
- [x] Update docs and changelog.
- [x] Run focused validation.
- [x] Run final design inspection and classify remaining paths.
- [x] Commit scoped changes.

## Current Findings

- `desktopChatSendPreparation.ts` still calls
  `buildReadableFileAttachmentContext(...)` and
  `resolveQueryScreenshotArtifacts(...)` before `conversation.send`.
- `DesktopLiveTurnRuntimeClient.sendQuery(...)` still forwards resolved
  backend-shaped fields such as `attachment_context`, `screenshot_ref`, and
  `capture_meta`.
- `ConversationRuntime.send()` already emits `turn_started` and base
  `user_message` before SDK `enrichQuery`; the missing piece is a typed resource
  resolution stage between base row emission and SDK memory/model-facing
  enrichment.
- Electron main's direct WakeUp adapter calls `activeRuntime.send(sendInput)`;
  this is the first integration point for desktop resource resolvers.

## Decisions

- Use typed turn input resources instead of a catch-all payload mutator.
- Preserve the existing backend transport payload fields as final pipeline
  output for compatibility.
- Keep renderer resource handles UI-owned, but move resource meaning,
  resolution lifecycle, metadata merge, and failure semantics into SDK.
- Preserve the live-turn presentation contract from `b190e4db6`: after SDK
  `send()` enters the turn lifecycle, it emits `turn_started` and base
  `user_message` before resource resolution, keeping
  `currentTurn.userMessageRowId`, `presentation.awaitingAnchor`, and
  `presentation.overlayIntent` valid while resolvers are pending.
- Reuse SDK `localRuntime.executeTool`, `localToolLifecycle`, and
  `sdkClient.artifacts` for default desktop resource resolvers instead of
  adding a new Electron bridge.
- Keep replay's stored screenshot-ref path as legacy resolved metadata because
  replay uses durable transcript payloads, not live composer resource handles.

## Changes Made

- Added public SDK `TurnInputResource`, resolver, and resolution result types.
- Added `TurnInputPipeline` to resolve resources after the base user row and
  before memory/context enrichment.
- Added default SDK resource resolvers for `readable_file`,
  `clipboard_image`, `query_screenshot_request`, and `workspace`.
- Wired `WindieAgent.conversation()` to install default resource resolvers and
  allow host overrides.
- Changed renderer successful send preparation to submit typed resource handles
  and display-safe metadata, removing pre-send file reads and screenshot
  capture/upload.
- Preserved SDK-only `resources` and `metadata` through Electron main query
  filtering, then stripped them before backend payload transport.
- Deleted dead renderer-side readable-file and query-screenshot resolver
  modules and their obsolete tests.
- Updated active docs and changelog to describe SDK-owned resource resolution.

## Validation Log

- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs` - passed.
- `cd frontend && npm run typecheck` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/ChatMessageSenderPayloads.test.ts ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs` - passed after deleting obsolete renderer resolver modules.
- `cd frontend && npm run typecheck` - passed after final edits.
- `bin/windie docs list` - passed.
- `git diff --check` - failed only on pre-existing unrelated `AGENTS.md` trailing whitespace.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.
- `cd frontend && npm run lint -- ...` - blocked by existing repo-wide lint errors outside this refactor and one pre-existing unused parameter in touched `ipc.cjs`.
- `cd frontend && npx eslint src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts src/renderer/features/chat/hooks/useChatMessageSender.ts src/renderer/features/chat/hooks/useConversationReplayActions.js src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts src/main/ipc/ipc_query_runtime.cjs` - passed.

## Commits

- Implementation commit created after this complete report snapshot.

## Inspection Log

- Initial inspection read the approved plan, renderer send preparation,
  renderer live-turn command facade, readable-file and screenshot helper paths,
  SDK `ConversationRuntime`, SDK `WindieAgent`, SDK context enrichment, and
  Electron main direct WakeUp adapter.
- Implementation inspection confirmed normal renderer send preparation no
  longer imports or calls the deleted renderer file-read/screenshot resolver
  modules.
- Implementation inspection confirmed Electron main preserves SDK-only
  `resources`/`metadata` through query filtering but strips them from
  backend-bound payload before `agent.run(...)`.
- Implementation inspection confirmed SDK `ConversationRuntime.send()` keeps
  `turn_started` and base `user_message` before `resolveTurnInputResources(...)`.
- Final inspection confirmed no live source or active focused tests reference
  the deleted renderer resolver modules; remaining references are historical
  planning docs or compatibility test names outside this refactor.
- Final inspection confirmed active docs were updated from renderer
  optimistic/pre-resolved attachment ownership to SDK user-row/resource
  ownership.

## Remaining Risks

- Historical docs/plans and old stream-ingress compatibility tests still use
  "optimistic user row" terminology for prior architecture eras; active docs
  were updated to SDK user-row/resource wording.
