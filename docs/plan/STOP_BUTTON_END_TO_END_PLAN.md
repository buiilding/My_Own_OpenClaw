---
summary: "Implementation plan for a dashboard/pill Stop button that cancels active work across frontend streaming, backend/provider execution, and sidecar tool runs."
read_when:
  - Implementing user-triggered cancellation of an active WindieOS turn.
  - Adding a Stop button in the dashboard and chat pill UI.
  - Ensuring cancellation does not interfere with ongoing development work.
---

# Stop Button End-to-End Plan

## Objective

Add a true user Stop action so that when a user clicks Stop:

1. Frontend stops streaming/thinking UI for the active turn.
2. Backend cancels the active query task and stops provider querying.
3. Sidecar stops active tool execution for that turn.
4. The system returns to an idle state so the user can send the next query immediately.

This plan is additive and scoped so normal behavior is unchanged unless Stop is explicitly used.

## Current Gaps (Snapshot: February 16, 2026)

- Frontend has send/stream/tool flows, but no global Stop action in chat pill/dashboard.
- IPC/main path has no dedicated cancel message path.
- Backend incoming schema/routing has no cancel message type.
- Backend task cleanup is mostly connection-scope, not explicit per-turn user cancellation.
- Tool result waiting can block while backend waits for sidecar tool result futures.
- Sidecar has no unified cancel RPC for active tool execution.

## Product Semantics (Source of Truth)

1. Stop is best-effort immediate cancellation for the active turn only.
2. Stop is idempotent.
3. Stop does not erase conversation history.
4. After Stop, user can send a new query without restart or reconnect.
5. Late events from a canceled turn are ignored by frontend and backend dispatch.

## Protocol Changes

## Incoming

Add new incoming websocket message:

- `type`: `cancel-turn`
- `payload`:
  - `conversation_ref`: string
  - `turn_id`: optional string
  - `request_id`: optional string
  - `reason`: optional string default `user-stop`

## Outgoing

Add new outgoing websocket message:

- `type`: `turn-cancelled`
- `payload`:
  - `conversation_ref`: string
  - `turn_id`: optional string
  - `cancelled_by`: `user`
  - `timestamp`: ISO-8601 string

Optional diagnostic event:

- `type`: `cancel-ack`
- `payload`:
  - `accepted`: boolean
  - `had_active_turn`: boolean
  - `reason`: optional string

## Implementation Plan

### Phase 1: Frontend Stop UX and Turn Guards

Target files:

- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/infrastructure/services/ApiClient.ts`

Changes:

1. Add Stop button to dashboard input area and chat pill flow.
2. Add `isStopping` and `activeTurnId` state.
3. Dispatch `cancel-turn` through API client/IPC.
4. Immediately shift UI from active streaming to cancellable/pending stop state.
5. Gate stream/tool handlers by `activeTurnId` and ignore events from canceled turns.
6. When cancellation confirmation arrives, set idle state and re-enable input.

### Phase 2: IPC/Main Relay

Target files:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/services/backend_ws_service.cjs` (or equivalent backend bridge)

Changes:

1. Allow `cancel-turn` payload pass-through from renderer to backend websocket transport.
2. Ensure no overlay phase deadlock when stop is in flight.
3. Relay `turn-cancelled` event back to renderer.

### Phase 3: Backend Message Contract and Routing

Target files:

- `backend/src/api/contracts/message_types.py`
- `backend/src/api/schemas/incoming.py`
- `backend/src/api/schema.py` (if union/export path differs)
- `backend/src/core/container/incoming_routing.py`
- `backend/src/api/handlers/*` (new cancel handler)

Changes:

1. Add incoming type constant `cancel-turn`.
2. Add incoming payload schema and union registration.
3. Add route binding to a new cancel handler key.
4. Add outgoing type constant `turn-cancelled` and schema if centrally defined.

### Phase 4: Backend Runtime Cancellation

Target files:

- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/agent/*` (session/executor loop boundaries as needed)
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/tools/tool_result_storage.py`

Changes:

1. Track active turn task by connection and conversation.
2. On `cancel-turn`, cancel active task with `asyncio.Task.cancel()`.
3. Handle `CancelledError` in query execution path and emit deterministic terminal `turn-cancelled`.
4. Add tool-result-storage cancel method to fail pending futures quickly on turn cancel.
5. Ensure interaction loop exits cleanly and does not continue requesting provider tokens after cancel.

### Phase 5: Sidecar Tool Cancellation

Target files:

- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/tools/registry.py`
- tool modules that spawn subprocesses or long-running jobs

Changes:

1. Add sidecar RPC method for cancellation, scoped to active turn/request where possible.
2. Track active tool execution tasks.
3. On cancellation, cancel coroutine and terminate spawned subprocesses with graceful timeout then hard kill fallback.
4. Return consistent canceled result shape to backend.

## Data and State Rules

1. One active turn per conversation UI context.
2. Canceling one turn must not cancel future turns.
3. Turn IDs are mandatory for new sends and attached to all stream/tool events.
4. Any event missing turn correlation is treated as legacy and handled conservatively.

## Failure Handling

1. If provider cannot be interrupted instantly, backend still marks turn canceled and drops late tokens.
2. If sidecar tool ignores cancellation, backend enforces timeout and detaches from that execution.
3. If Stop is clicked while idle, return `cancel-ack` with `had_active_turn=false`.

## Testing Plan

Backend tests:

- Incoming schema accepts `cancel-turn`.
- Route table validation includes cancel route.
- Cancel handler cancels active query task.
- Query execution emits `turn-cancelled` and does not emit normal completion for canceled turn.
- Tool result future cancellation unblocks interaction loop.

Sidecar tests:

- Cancel RPC cancels active tool coroutine.
- Subprocess-backed tool receives terminate/kill flow.
- Sidecar returns canceled status without crashing local backend.

Frontend tests:

- Stop button appears during active turn and is disabled when idle.
- Clicking Stop sends `cancel-turn`.
- Streaming UI halts and input becomes available after cancellation.
- Late streaming/tool events from canceled turn are ignored.

## Rollout Strategy (Low Interference)

1. Keep changes additive and localized to stop/cancel paths.
2. Avoid broad refactors while introducing cancellation.
3. Keep existing send/query path untouched except turn-id correlation and cancellation guards.
4. Ship behind normal UI behavior: no runtime behavior change unless user clicks Stop.

## Definition of Done

1. User can click Stop in dashboard and pill contexts.
2. Active provider query is canceled and no further streamed tokens are displayed.
3. Active sidecar tool execution is canceled or detached with bounded timeout.
4. UI returns to ready state and accepts a new query immediately.
5. Automated tests cover frontend, backend, and sidecar cancellation contracts.

## Follow-up Docs To Update After Implementation

- `docs/COMMUNICATION_FLOW.md`
- `docs/API_REFERENCE.md`
- `docs/FRONTEND_ARCHITECTURE.md`
- `docs/BACKEND_ARCHITECTURE.md`
- `docs/PYTHON_SIDECAR.md`
