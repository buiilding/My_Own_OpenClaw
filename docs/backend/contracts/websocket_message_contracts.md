---
summary: "Canonical backend websocket message contracts: incoming and outgoing schemas, routing map, and tool result payload semantics."
read_when:
  - When adding/changing websocket message types.
  - When debugging payload validation failures or handler mismatch.
title: "WebSocket Message Contracts"
---

# WebSocket Message Contracts

Canonical schema source:

- Incoming: `backend/src/api/schemas/incoming.py`
- Outgoing: `backend/src/api/schemas/outgoing.py`
- Routing table: `backend/src/core/container/incoming_routing.py`

## Incoming Messages

Discriminator field: `type`.

Supported incoming message types:

- `query`
- `stop-query`
- `rehydrate-conversation`
- `load-settings`
- `list-models`
- `update-settings`
- `wakeword-detected`
- `tool-result`
- `tool-bundle-result`

### `query` payload

Fields:

- `text`
- `conversation_ref`
- optional: `content`, `screenshot`, `screenshot_ref`, `system_state_internal`

### `tool-result` payload

Fields:

- `request_id`
- `success`
- optional `data` (includes `llm_content`, optional `system_state`, optional screenshot fields)
- optional `error`

### `tool-bundle-result` payload

Fields:

- `bundle_id`
- `status`: `success | partial_failure | failure`
- `step_results[]`
- optional screenshot/system-state fields
- optional `error`

## Outgoing Messages

Core stream/control families:

- Stream progression: `llm-thought`, `streaming-response`, `streaming-complete`
- Tool progression: `tool-call`, `tool-bundle`, `tool-output`
- Transparency: `system-prompt`, `tool-schemas`, `user-message-full`, `assistant-message-full`
- Runtime extras: `token-count`, `memory-store`, `audio-chunk`, `error`, wakeword events

## Handler Routing Contract

`INCOMING_ROUTES` in `incoming_routing.py` must match schema literals exactly.

Mapped handlers:

- `query_handler`
- `stop_query_handler`
- `rehydrate_conversation_handler`
- `tool_result_handler`
- `wakeword_handler`
- `list_models_handler`
- `load_settings_handler`
- `update_settings_handler`

`validate_incoming_routes()` enforces:

- no duplicates
- no missing schema message types
- no extra route-only message types

## Compatibility Guidance

When adding a new incoming message type:

1. Add schema model + include in `IncomingMessage` union.
2. Add route entry to `INCOMING_ROUTES`.
3. Register handler in API container wiring.
4. Add formatter/renderer-side handling if it emits new outgoing events.

## Related Pages

- `docs/backend/contracts/message_types/README.md`
- `docs/backend/contracts/message_types/message_type_constants_schema_subset_and_handler_ack_reference.md`
- `docs/backend/contracts/message_schema_and_formatter_reference.md`
