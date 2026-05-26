---
summary: "Frontend/backend websocket command contract reference for incoming message envelope fields, payload-owned fields, and schema fixture validation."
read_when:
  - When changing desktop query, stop, rehydrate, settings, model-list, compact-history, or tool-result websocket sends.
  - When debugging backend schema errors caused by frontend websocket payload fields.
title: "Backend WebSocket Command Contract"
---

# Backend WebSocket Command Contract

## Canonical Files

- `backend/src/api/schemas/incoming.py`
- `backend/src/api/contracts/incoming_message_contract.json`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `packages/windie-sdk-js/src/transport/ManagedBackendSession.ts`

## Envelope Context

These fields belong to the websocket envelope, not command payloads:

- `id`
- `type`
- `payload`
- `user_id`
- `session_id`
- `conversation_ref`
- `turn_ref`
- `timestamp`

`turn_ref` is envelope/stream context. It must not be added to `query.payload`, `stop-query.payload`, or other backend command payload objects unless the backend schema explicitly adds it there.

## Payload Contract

Backend Pydantic models in `incoming.py` own command payload keys. The JSON fixture in `incoming_message_contract.json` is a test-only export of those keys for frontend contract tests; frontend runtime code must not import Python.

Frontend sends must validate against that fixture for:

- `query`
- `stop-query`
- `rehydrate-conversation`
- `load-settings`
- `list-models`
- `update-settings`
- `wakeword-detected`
- `compact-history`
- `tool-result`
- `tool-bundle-result`

Tool-result `data` and bundle `step_results[]` intentionally allow tool-specific extra fields, but their top-level payload keys remain closed.

`query.payload` allows the desktop query path to send structured
`query_context` alongside legacy `content`. Backend prompt rendering owns turning
`query_context.memories` and `query_context.attachment_context` into
model-visible user context. Electron main may also attach `agent_definition` to
query sends for local repo instruction, skill, and custom-instruction layers;
generic rehydrate forwarding does not add that context.
