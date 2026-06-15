---
summary: "Realtime implementation report for making Stop a control acknowledgement path with SDK-owned visible terminalization and exact turn targeting."
read_when:
  - When continuing or auditing the Stop control acknowledgement implementation.
  - When validating Stop regressions involving `Backend stream sequence regressed`, `conversation.stop`, `stop-query`, or SDK current-turn terminalization.
title: "Stop Control Acknowledgement Report"
---

# Stop Control Acknowledgement Report

Date: 2026-06-15

Plan: [Stop Control Acknowledgement Plan](2026-06-15-stop-control-acknowledgement-plan.md)

Status: complete.

## Objective

Implement the approved plan until the Stop path is a control acknowledgement
path, not a backend stream completion producer. Preserve immediate SDK-owned
visible terminalization and exact turn targeting.

## Checklist

- [x] Re-read the approved plan and required docs.
- [x] Inspect recent related commits.
- [x] Confirm current violation: backend Stop still emits synthetic
  `streaming-complete`.
- [x] Preserve `turn_ref` through renderer, Electron main, SDK agent, and
  backend stop transport.
- [x] Make backend `stop-query` acknowledgement-only.
- [x] Add exact-turn backend cancellation support.
- [x] Add/update focused backend tests.
- [x] Add/update focused SDK/frontend tests.
- [x] Update docs.
- [x] Run focused validation.
- [x] Perform final design inspection.
- [x] Update changelog.
- [x] Commit scoped implementation.

## Inspection Log

### 2026-06-15 Initial Inspection

Read:

- `docs/plans/2026-06-15-stop-control-acknowledgement-plan.md`
- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `docs/concepts/streaming_and_events.md`
- `docs/sdk/conversation_runtime.md`
- `docs/architecture/frontend_architecture.md`
- `docs/desktop/minimal_chat_pill.md`
- `docs/backend/api/handlers/non_query_handler_dispatch_and_payload_normalization_reference.md`
- `docs/backend/api/non_query_handler_and_control_flow_reference.md`

Findings:

- Recent commit `a5f7caf37 fix(stop): sequence backend stop completion`
  intentionally added a `StreamEventSequencer` to backend `StopQueryHandler`.
  That fixed missing backend identity but kept Stop as a backend stream
  completion producer.
- Current docs still say `stop-query` always emits `streaming-complete`; these
  docs must be updated with the implementation.
- Renderer/dashboard and minimal pill pass `turn_ref` into
  `DesktopLiveTurnRuntimeClient.stop(...)`.
- `DesktopLiveTurnRuntimeClient.stop(...)` invokes `conversation.stop` with
  both `conversation_ref` and `turn_ref`.
- Electron main extracts `turn_ref`, but `WindieAgent.stop(...)` only accepts a
  conversation ref and drops the turn ref before the SDK session sends
  `stop-query`.
- Backend active query tracker stores `(turn_ref, conversation_ref)` per task,
  but cancellation only accepts `conversation_ref`.
- Backend `StopQueryHandler` currently emits `streaming-complete` even when no
  task was active.

Decision:

- Replace the recent sequenced-completion stop design with an acknowledgement
  control response. The SDK sequence regression guard remains correct and
  should not be weakened.

### 2026-06-15 Implementation Notes

Implemented:

- SDK `WindieAgent.stop(...)` now accepts a structured stop payload and
  preserves `conversation_ref` plus `turn_ref`.
- SDK websocket sessions and Electron main payload allowlists now send
  `turn_ref` on `stop-query`.
- Backend `StopQueryPayload` accepts validated optional `turn_ref`.
- Backend active query cancellation and pending-stop race guard are scoped by
  `(conversation_ref, turn_ref)` when supplied.
- Backend `StopQueryHandler` emits schema-backed `stop-query-ack` control
  traffic without `event_id`, `sequence`, or `StreamEventSequencer`.
- Docs now state that SDK/current-turn projection owns visible stop
  terminalization and backend Stop is only an acknowledgement/cancellation
  control path.

## Validation Log

### 2026-06-15 Focused Backend

Passed:

```bash
./scripts/python-in-env backend python -m pytest \
  tests/backend/test_api_handlers.py::test_stop_query_handler_cancels_active_query_and_emits_control_ack \
  tests/backend/test_api_handlers.py::test_stop_query_handler_cancels_only_matching_turn_ref \
  tests/backend/test_active_query_tracker.py \
  tests/backend/test_session_manager.py::test_cancel_active_query_task_sets_pending_stop_and_consumes_late_registration \
  tests/backend/test_session_manager.py::test_register_active_query_task_ignores_expired_pending_stop_request \
  tests/backend/test_session_manager.py::test_cancel_active_query_task_scopes_cancellation_by_conversation_ref \
  tests/backend/test_session_manager.py::test_cancel_active_query_task_scopes_cancellation_by_turn_ref \
  tests/backend/test_session_manager.py::test_pending_stop_request_is_scoped_to_matching_conversation_ref \
  tests/backend/test_incoming_message_contract.py \
  tests/backend/test_api_contract_registry.py
```

Result: `25 passed`.

### 2026-06-15 Focused Frontend

Passed:

```bash
bin/windie test frontend -- \
  tests/frontend/FrontendBackendWebsocketContract.test.cjs \
  tests/frontend/IpcMainBridge.lifecycle.test.cjs \
  tests/frontend/WindieSdkClient.test.ts \
  tests/frontend/DesktopBackendTransport.test.ts \
  tests/frontend/DesktopLiveTurnRuntimeClient.test.ts \
  tests/frontend/WindieSdkConversationRuntime.test.ts
```

Result: `260 passed`. Jest reported open handles after completion; the already
successful run was stopped manually to avoid leaving a background process.

### 2026-06-15 Broader Backend Attempt

Command attempted:

```bash
bin/windie test backend -- \
  tests/backend/test_api_handlers.py \
  tests/backend/test_active_query_tracker.py \
  tests/backend/test_session_manager.py \
  tests/backend/test_incoming_message_contract.py \
  tests/backend/test_api_contract_registry.py
```

Result: failed in unrelated `test_api_handlers.py` query/rehydrate tests before
the focused Stop assertions. Failures included existing trace-event count
expectations and stricter rehydrate validation errors; focused Stop/session
tests passed separately.

### 2026-06-15 Design Inspection

Search confirmed no Stop handler references remain to:

- `StreamEventSequencer`
- `OutgoingMessageType.STREAMING_COMPLETE`
- Stop-specific docs that say `stop-query` emits `streaming-complete`

## Commits

2026-06-15:

- `400b686b2 fix(stop): make stop an ack control path`

## Remaining Work

None.
