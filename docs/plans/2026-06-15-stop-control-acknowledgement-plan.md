---
summary: "Pre-flight plan for making Stop a control acknowledgement path instead of a backend stream completion producer, with SDK-owned visible terminalization and exact turn targeting."
read_when:
  - When changing Stop, cancel, interrupt, `conversation.stop`, `stop-query`, SDK current-turn terminalization, backend stream sequence handling, or late-event suppression.
  - When debugging `Backend stream sequence regressed` runtime errors after pressing Stop in the dashboard or minimal chat pill.
title: "Stop Control Acknowledgement Plan"
---

# Stop Control Acknowledgement Plan

Date: 2026-06-15

Status: proposed; awaiting approval before implementation.

## User Intent

The user pressed Stop from the main dashboard and saw:

```text
Backend stream sequence regressed from 17 to 1
RUNTIME_ERROR API · WINDIE:CURRENT-TURN
```

The user wants the Stop feature fixed at the architecture path, not patched
again at the visible dashboard symptom. The chosen direction is:

```text
Backend Stop should be a control acknowledgement, not a backend stream
completion producer.
```

## Current Diagnosis

The intended product contract is sound:

1. The renderer records user intent to stop the visible active turn.
2. The SDK current-turn projection terminalizes locally so dashboard and pill
   leave busy state immediately.
3. Electron main forwards the SDK-shaped stop command.
4. Backend cancels the active query.
5. Late backend output for the stopped turn cannot reactivate the UI.

The current implementation violates that contract in the backend stop handler:

- Renderer callers have a `turn_ref` available, but the SDK agent/backend stop
  path mostly collapses Stop to `conversation_ref`.
- Backend `stop-query` cancels the active query and then emits a synthetic
  `streaming-complete` event.
- That synthetic completion uses a fresh `StreamEventSequencer(turn_ref)`.
- For a turn that already emitted sequences up to `17`, the stop handler can
  emit sequence `1` for the same turn, causing the SDK sequence guard to
  surface `Backend stream sequence regressed from 17 to 1`.

This is a control/data boundary bug. Stop is currently acting both as:

- a control command that cancels work; and
- a stream-event producer that tries to terminalize UI state.

Only the first role belongs to backend Stop. Visible terminalization already
belongs to SDK current-turn projection.

## Reference Repo Findings

### Codex

Codex interrupts exact turns:

```text
turn/interrupt(threadId, turnId)
  -> validate requested turn is active
  -> submit Op::Interrupt
  -> core aborts active tasks
  -> server emits turn/completed status=interrupted from the real abort event
```

Important lesson: interruption is a control op targeting an exact turn. It does
not create an unrelated fresh stream completion with reset identity.

### OpenClaw

OpenClaw chat aborts exact runs:

```text
UI creates runId before send
runId is the idempotency key and active abort target
chat.abort(sessionKey, runId) aborts that run's AbortController
gateway broadcasts chat state=aborted
late assistant/final events for aborted run are suppressed
```

Important lesson: abort state is keyed by the active run id, and late stream
events are suppressed. Abort does not restart stream sequencing.

## Owning Runtime Decision

| Concern | Owner after this plan | Rule |
| --- | --- | --- |
| User-visible Stop responsiveness | SDK current-turn projection plus renderer immediate patch | Stop must clear busy state before backend round-trip finishes. |
| Stop IPC command | Renderer -> Electron main -> SDK runtime | Use `conversation.stop` and preserve exact `conversation_ref` and `turn_ref`. |
| Backend cancellation | Backend session/query runtime | Cancel the active backend task for the exact turn/conversation. |
| Backend stop acknowledgement | Backend API control response | Acknowledge Stop without emitting synthetic `streaming-complete`. |
| Stream event sequencing | Original query stream pipeline | Only the original stream context may produce sequenced backend stream events. |
| Late backend events after Stop | SDK/backend event gating | Late events for a stopped turn must not reactivate visible current-turn state. |
| Native overlay/window state | Electron main/renderer surface code | Mirror SDK current-turn state; do not infer Stop completion from backend synthetic stream events. |

## Target Architecture

Move from this path:

```text
renderer Stop
  -> local UI patch
  -> conversation.stop(conversation_ref, turn_ref)
  -> Electron main forwards to WindieAgent.stop(...)
  -> SDK agent sends stop-query with conversation_ref only
  -> backend cancels whatever task matches conversation_ref
  -> backend emits synthetic streaming-complete with fresh sequence=1
  -> SDK sees same turn sequence regression and renders runtime_error
```

to this path:

```text
renderer Stop
  -> SDK current-turn terminalizes locally
  -> conversation.stop(conversation_ref, turn_ref)
  -> Electron main preserves both ids
  -> SDK transport sends stop-query with conversation_ref and turn_ref
  -> backend validates/cancels exact active query
  -> backend returns stop acknowledgement only
  -> no backend stop-handler streaming-complete is emitted
  -> late query-stream events are ignored or stay on original stream identity
```

## Deletion Contract

The implementation must delete or fully disconnect:

- backend `stop-query` synthetic `streaming-complete` emission;
- backend stop-handler creation of a fresh `StreamEventSequencer` for an
  already-running turn;
- SDK agent stop transport code that drops `turn_ref`;
- tests that encode backend Stop as a stream completion producer.

The implementation must preserve:

- SDK `ConversationRuntime.stop()` local `turn_stopped` behavior;
- renderer immediate busy/thinking/current-turn cleanup;
- late-event suppression for stopped turns;
- successful Stop when called during the pre-stream gap where `turn_ref` may be
  missing but `conversation_ref` is known.

## In Scope

### 1. Stop Transport Identity

- Trace `conversation.stop` from renderer through Electron main and SDK agent
  transport.
- Preserve exact `conversation_ref` and `turn_ref` through the public stop
  command shape.
- Update the SDK agent/session transport interfaces so stop payloads can carry
  `turn_ref`.
- Keep the pre-stream fallback: if `turn_ref` is absent, backend may cancel by
  `conversation_ref`, but this path must still not emit synthetic stream
  completion.

### 2. Backend Stop Handler

- Change `stop-query` to be a control acknowledgement only.
- Remove the handler-local stream sequencer and synthetic
  `streaming-complete`.
- Return a clear acknowledgement payload such as:

```json
{
  "status": "stopped",
  "canceled": true,
  "conversation_ref": "...",
  "turn_ref": "..."
}
```

- The ack must not be consumed by renderer as assistant/chat stream content.

### 3. Backend Active Query Targeting

- Extend active-query cancellation to accept `turn_ref` where available.
- Validate that a requested `turn_ref` matches the active task for the
  requested `conversation_ref`.
- If the turn already ended, return a harmless non-stream acknowledgement rather
  than producing a runtime error.
- Preserve pending-stop behavior for the pre-stream gap, but scope it by
  conversation and turn when the ids are known.

### 4. Late Event Handling

- Verify SDK stopped-turn gating still ignores late backend events for the
  stopped turn.
- If needed, add an explicit stopped-turn ledger keyed by
  `conversationRef + turnRef` in the SDK runtime instead of relying on UI state
  alone.
- Do not weaken backend sequence guards; the regression guard is valuable and
  correctly exposed the bad stop event.

### 5. Tests

Add or update focused tests for:

- dashboard/pill Stop terminalizes immediately before backend ack;
- SDK agent stop transport preserves `turn_ref`;
- backend stop acknowledgement does not emit `streaming-complete`;
- backend stop cancels exact `conversation_ref + turn_ref`;
- backend stop without `turn_ref` still works for pre-stream cancellation;
- late stream events after Stop do not reactivate current-turn busy state;
- no `Backend stream sequence regressed` runtime error is produced by Stop.

## Out of Scope

- Redesigning all query lifecycle events.
- Changing provider streaming behavior.
- Changing transcript persistence semantics except where Stop currently writes
  incorrect terminal stream rows.
- Removing dashboard/pill local immediate UI patches in this phase. Those can be
  simplified later only after SDK current-turn terminalization is proven stable.
- Changing tool cancellation semantics beyond ensuring stopped query turns do
  not leave visible current-turn state active.

## Implementation Workflow

1. Inspect the live stop path:
   - renderer dashboard `handleStopQuery`;
   - minimal pill `handleStopQuery`;
   - `DesktopLiveTurnRuntimeClient.stop`;
   - Electron main `conversation.stop`;
   - SDK `ConversationRuntime.stop`;
   - SDK `WindieAgent.stop` and session transport;
   - backend `StopQueryHandler`;
   - active query tracker and query execution cancellation path.
2. Update SDK/Electron stop payload plumbing so `turn_ref` is not lost.
3. Update backend schemas and handler routing for exact stop identity.
4. Remove synthetic backend stream completion from `StopQueryHandler`.
5. Add backend tests proving Stop ack is non-stream and exact-turn targeted.
6. Add SDK/frontend tests proving local terminalization still wins immediately.
7. Run focused validation.
8. Perform a fresh design inspection:
   - search for remaining stop paths that emit stream completion;
   - search for remaining stop paths that drop `turn_ref`;
   - classify any remaining fallback as pre-stream-only or out of scope.
9. Update the matching implementation report before any commit.

## Success Criteria

- Pressing Stop from the dashboard does not render
  `Backend stream sequence regressed`.
- Backend `stop-query` never emits a synthetic sequenced
  `streaming-complete`.
- Stop can target the visible turn by `conversation_ref + turn_ref`.
- If `turn_ref` is absent during the pre-stream gap, Stop still cancels by
  conversation without producing stream content.
- SDK current-turn projection leaves busy state immediately on Stop.
- Late backend chunks for the stopped turn cannot reopen typing/response state.
- Tests cover the exact regression and the pre-stream fallback.
- The final design inspection finds no in-scope duplicate Stop terminalization
  producer outside SDK current-turn projection.

## Validation Commands

Focused validation should start with:

```bash
bin/windie test frontend -- tests/frontend/StopQueryState.test.js tests/frontend/WindieSdkConversationRuntime.test.ts tests/frontend/ChatInterfaceWiring.test.jsx tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx
bin/windie test backend -- tests/backend/test_stop_query.py
```

If backend test names differ, use `bin/windie test pick stop-query` or search
the backend test tree and run the nearest stop-query/session cancellation tests.

If stop payload contracts move across SDK CJS artifacts, also run the relevant
SDK build or fixture generation command used by the touched SDK package before
committing.

## Reread Anchors After Compaction

- This plan.
- Matching report:
  `docs/plans/2026-06-15-stop-control-acknowledgement-report.md`.
- `docs/development/agent_runtime_ownership_and_change_routing.md`.
- `docs/concepts/streaming_and_events.md`.
- `docs/sdk/conversation_runtime.md`.
- `docs/desktop/minimal_chat_pill.md`.
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`.
- `packages/windie-sdk-js/src/runtime/WindieAgent.ts`.
- `packages/windie-sdk-js/src/transport/WindieAgentSession.ts`.
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`.
- `frontend/src/main/ipc.cjs`.
- `frontend/src/main/ipc/ipc_chat_query_handlers.cjs`.
- `backend/src/api/handlers/stop_query.py`.
- `backend/src/agent/session/active_query_tracker.py`.
- `backend/src/api/services/query_execution.py`.

## Assumptions

- The screenshot regression is caused by backend Stop emitting a fresh
  sequenced `streaming-complete` after the original turn already emitted higher
  sequence numbers.
- The SDK sequence regression guard is correct and should stay strict.
- User-visible Stop responsiveness should remain local/SDK-owned; backend
  cancellation success is not the thing that makes the UI feel stopped.
- The backend can safely acknowledge Stop via the websocket request response
  path without producing a model/assistant stream event.
