---
summary: "Electron main to backend websocket command contract reference for incoming message envelope fields, payload-owned fields, and schema fixture validation."
read_when:
  - When changing desktop query, stop, rehydrate, settings, model-list, compact-history, or tool-result websocket sends.
  - When debugging backend schema errors caused by Electron main or SDK websocket payload fields.
title: "Backend WebSocket Command Contract"
---

# Backend WebSocket Command Contract

## Canonical Files

- `backend/src/api/schemas/incoming.py`
- `backend/src/api/contracts/incoming_message_contract.json`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `packages/windie-sdk-js/src/transport/ManagedWebSocketSession.ts`

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

Backend Pydantic models in `incoming.py` own command payload keys. The JSON fixture in `incoming_message_contract.json` is a test-only export of those keys for Electron client contract tests; Electron main, renderer, and SDK runtime code must not import backend Python.

Electron main and SDK websocket sends must validate against that fixture for:

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

`query.payload.content` is required and must contain SDK/client-prepared
model-facing query content. Electron main may also attach `agent_definition` to
query sends for local repo instruction, skill, and custom-instruction layers;
generic rehydrate forwarding does not add that context.
