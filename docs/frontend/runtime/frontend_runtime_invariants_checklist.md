---
summary: "Canonical frontend runtime invariants and PR checklist for chat-pill/response-overlay loop behavior, platform screenshot policy, and interactivity ownership."
read_when:
  - When changing chat-pill, response-overlay, stream phase, or SDK/local-runtime tool behavior.
  - When reviewing pull requests that touch frontend runtime state, overlay IPC, or platform capture flow.
title: "Frontend Runtime Invariants and PR Checklist"
---

# Frontend Runtime Invariants and PR Checklist

## Scope

This page defines the non-negotiable runtime contracts for the frontend loop and overlay behavior.
Any change touching renderer chat loop state, main-process overlay phase handling, or platform screenshot handling must preserve these invariants or update this doc in the same PR.

## Runtime Invariants

1. Chat loop UI projection is phase-driven and deterministic.
   - user message -> chat pill + typing indicator
   - first token -> chat pill + response overlay
   - tool output -> chat pill + typing indicator
2. Active loop interactivity is owned by main-process overlay phase.
   - during `awaiting-first-chunk|streaming|tool-call|tool-output`: chat pill + response overlay are click-through and `focusable=false`
   - renderer does not toggle loop interactivity directly
3. Dashboard stop remains clickable; chat pill stop is not a loop stop path.
4. Linux screenshot contract:
   - before screenshot capture: hide chat pill
   - keep chat pill/response overlay non-focusable
   - after capture: restore chat pill visibility (no focus steal)
   - Electron main owns the screenshot-capture lease; renderer code does not hide or restore windows
5. Windows/macOS screenshot contract:
   - no renderer hide/show collapse path for capture
   - rely on overlay content protection policy only during SDK screenshot-capture leases
   - disable overlay content protection immediately after capture
6. No tab/window refocus recovery hacks in renderer chat-pill runtime.
7. Overlay geometry is stable.
   - avoid live resize/position churn during stream/token updates
   - avoid flicker from redundant hide/show cycles
8. Startup session bootstrap is deterministic across dashboard + chat pill.
   - renderer must hydrate transcript/chat active conversation from main-process snapshot before first-send fallback generation
   - first query after close/reopen must reuse active conversation when one exists in main-session state
   - conversation ref generation is allowed only when transcript store + chat store + main snapshot all report empty

## Required Regression Coverage (When Applicable)

When behavior changes in these areas, add or update tests in the same PR:

- chat-loop state ordering/reconnect watchdog:
  - `tests/frontend/ChatLoopUiStateHook.test.jsx`
- SDK/local-runtime stale-turn/correlation/late-result guards:
  - `tests/frontend/DesktopChatStreamEventRuntime.test.ts`
  - `tests/frontend/ChatStreamToolHandlers.test.ts`
  - `tests/frontend/AgentSdkConversationRuntime.test.ts`
  - `tests/frontend/AgentSdkPackageBoundary.test.ts`
- capture hide/restore overlap and platform policy:
  - `tests/frontend/LocalRuntimeWindowVisibility.test.cjs`
- main-process overlay phase to visibility/interactivity policy:
  - `tests/frontend/ResponseOverlayPhaseHandler.test.cjs`
  - `tests/frontend/IpcMainBridge*.test.cjs`

## PR Checklist Tokens

PR descriptions should check these tokens during review (or use `inv-na-no-frontend-runtime-change`):

- `inv-read-doc`
- `inv-chat-loop-flow`
- `inv-loop-interactivity`
- `inv-linux-capture-hide`
- `inv-win-mac-content-protection`
- `inv-no-focus-restore`
- `inv-tests-updated`
- `inv-na-no-frontend-runtime-change`
