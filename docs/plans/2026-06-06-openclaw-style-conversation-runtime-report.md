---
summary: "Realtime implementation report for the OpenClaw-style WindieOS conversation runtime plan."
read_when:
  - When continuing the OpenClaw-style conversation runtime implementation after context compaction.
  - When reviewing runtime-registry, display/inference split, compaction projection, or renderer rehydrate deletion work.
title: "OpenClaw-Style Conversation Runtime Report"
---

# OpenClaw-Style Conversation Runtime Report

Date: 2026-06-06

Plan: [OpenClaw-Style Conversation Runtime Plan](2026-06-06-openclaw-style-conversation-runtime-plan.md)

Status: complete.

## Approved Scope

Implement the approved OpenClaw-style architecture:

- Electron main owns a per-conversation SDK runtime registry.
- Renderer normal send no longer hydrates backend inference state.
- SDK/main prepares old-chat inference context as part of backend-dependent
  conversation operations.
- Renderer display loading consumes SDK display rows only.
- Compaction remains SDK/store-owned and is not renderer display state.
- Different conversations can run concurrently; same-conversation overlap is
  deterministic.

## Current Baseline

Initial inspection confirmed:

- `frontend/src/main/ipc.cjs` currently has one `runtime`, one
  `conversationRef`, and `selectConversationRuntime(...)` closes the previous
  runtime when switching conversations.
- `frontend/src/renderer/features/chat/session/conversationInferenceSessionRuntime.ts`
  owns renderer-side `unknown` / `hydrated` / `local-only` backend inference
  state and calls `conversation.rehydrate` before normal sends.
- `conversation.load` currently returns a broad SDK runtime snapshot that
  includes display and rehydrate state.
- SDK stores already expose display and rehydrate loaders, and SDK display rows
  already skip `compaction_applied` as chat bubbles.

## Checklist

- [x] Runtime registry implemented in Electron main.
- [x] Conversation-scoped SDK event fanout verified.
- [x] Renderer normal-send inference hydration removed.
- [x] SDK/main send-time inference preparation added.
- [x] Renderer display loading narrowed to display-only API.
- [x] Same-conversation concurrent sends guarded.
- [x] Compaction/inference projection contract inspected and tightened if
      needed.
- [x] Focused tests updated/added.
- [x] Design inspection finds no remaining in-scope old path.
- [x] Validation commands recorded.

## Decisions

- Use Electron main as the first registry owner because it already owns the
  desktop `WindieAgent` instance and native IPC fanout. SDK still owns runtime
  semantics; main only keeps multiple runtime handles alive.
- Treat renderer inference-session hydration as a deletion target for normal
  send. Any remaining explicit rehydrate command must be diagnostic or
  specialized continuity behavior, not display or normal send ownership.

## Validation Log

- `bin/windie docs list`
  - Result: passed.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/IpcMainConversationRuntimeRegistry.test.cjs ../tests/frontend/IpcMainReplayCommands.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/DesktopConversationLibraryClient.test.ts ../tests/frontend/DesktopTranscriptProjectionRuntimeClient.test.ts ../tests/frontend/DesktopConversationContinuityService.test.ts ../tests/frontend/RendererAppRuntimeBoundary.test.ts ../tests/frontend/RendererChatRuntimeBoundary.test.ts`
  - Result: passed, 8 suites / 55 tests.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/ConversationSessionRuntime.test.ts ../tests/frontend/NewChatSession.test.ts ../tests/frontend/ResetActiveChatSession.test.ts ../tests/frontend/ChatProvider.test.jsx ../tests/frontend/ChatSessionBootstrap.test.tsx ../tests/frontend/ConversationReplayActions.test.jsx ../tests/frontend/ChatInterfaceWiring.test.jsx ../tests/frontend/ManualCompactionRuntime.test.js ../tests/frontend/UseDashboardConversations.test.jsx ../tests/frontend/ChatGptDashboardShell.test.jsx ../tests/frontend/DesktopConversationStore.test.ts ../tests/frontend/DesktopBackendTransport.test.ts ../tests/frontend/IpcMainConversationRuntimeRegistry.test.cjs ../tests/frontend/IpcMainReplayCommands.test.cjs`
  - Result: passed, 15 suites / 183 tests. Existing console warnings appeared
    from frontend interaction logs and older React act warnings.
- `git diff --check`
  - Result: passed.

## Implementation Notes

- No commits have been created for this plan.
- Electron main now keeps a `Map<conversationRef, RuntimeHandle>` instead of
  one selected runtime. Sending or loading conversation B no longer detaches A.
- Runtime handles own SDK event subscriptions, latest snapshots, active turn
  state, inference-context freshness, and same-conversation send guarding.
- Backend disconnect marks all handle inference contexts stale in main, replacing
  the deleted renderer-side inference-session cache.
- Main prepares old-chat inference context immediately before SDK send/compact
  by loading the runtime snapshot and applying SDK rehydrate messages when
  needed.
- Replay edit/retry commands now execute through the registry conversation
  runtime instead of top-level agent helper calls that create temporary runtimes.
- Renderer normal send no longer imports or calls renderer inference hydration.
  The `conversationInferenceSessionRuntime.ts` module and its tests were
  deleted.
- Dashboard old-chat open now derives workspace binding from metadata and loads
  SDK display rows through `conversation.loadDisplay`; it does not request
  rehydrate/model-context rows.
- Renderer display facades use split commands: `conversation.loadDisplay` for
  display, `conversation.loadRehydrate` only for SDK/store-level rehydrate
  projection. The broad `conversation.load` remains only as canonical event
  access for the store/debug path.
- SDK display rows already carry `conversationRef`, and the renderer rows
  listener rejects rows without it. The new registry test verifies that a live
  runtime for conversation A can still emit rows after conversation B sends.

## Inspection Results

- `rg` found no renderer inference-session references except the boundary test
  asserting the deleted file.
- `rg` found no `selectConversationRuntime(...)` path and no main-process
  `agent.prepareEditAndResend(...)` / `agent.prepareRetryTurn(...)` calls.
- Remaining renderer `conversation.load` usage is the canonical event-store
  `loadEvents` adapter and its focused test, not chat display or normal send.
- Remaining renderer `conversation.loadRehydrate` usage is the SDK store
  `loadForRehydrate` projection, plus SDK/backend transport tests; it is not
  used by normal send or old-chat display.
- Final `rg` inspection found no selected-runtime switcher, no renderer
  inference-session cache references, and no main-process replay helper calls
  that bypass the registry.
