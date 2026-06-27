---
summary: "Deep reference for backend API message type constants: incoming set, outgoing stream schema subset, and non-schema handler ACK/control response types."
read_when:
  - When introducing a new websocket message type and deciding constants/schema/registry placement.
  - When debugging mismatch between emitted `type` strings, schema validation, and contract-registry drift tests.
title: "Message-Type Constants, Schema-Subset, and Handler ACK Reference"
---

# Message-Type Constants, Schema-Subset, and Handler ACK Reference

## Canonical Modules

- `backend/src/api/contracts/message_types.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/schemas/incoming.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/handlers/settings.py`
- `tests/backend/test_api_contract_registry.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_transport_envelope.py`

## Incoming Constants Contract

`IncomingMessageType` constants are canonical string literals for inbound websocket routing.

Current constants:

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

`INCOMING_MESSAGE_TYPES` is the tuple used by drift tests/registry checks.

## Outgoing Constants Contract

`OutgoingMessageType` contains two categories:

1. schema-validated stream/runtime messages (in `OUTGOING_SCHEMA_MESSAGE_TYPES`)
2. handler ACK/control responses not represented in outgoing schema union

### Schema-validated subset (`OUTGOING_SCHEMA_MESSAGE_TYPES`)

Includes stream/runtime types such as:

- `error`
- `streaming-response`
- `streaming-complete`
- `llm-thought`
- `tool-call`
- `tool-bundle`
- `tool-output`
- `audio-chunk`
- `wakeword-activated`
- `wakeword-greeting`
- `stop-query-ack`
- `system-prompt`
- `tool-schemas`
- `token-count`
- `user-message-full`
- `assistant-message-full`
- `settings-loaded`
- `settings-updated`
- `models-listed`

The stop, settings, and model ACK messages are emitted by non-query handlers via
`send_success_response(...)`, but they are still part of the outgoing schema
contract because renderer and SDK consumers observe them as first-party
websocket envelopes. `stop-query-ack` is control traffic; it is schema-backed
but not a backend stream event for current-turn projection.

## Why the Outgoing Set Is Split

`send_success_response(...)` and `build_transport_message(...)` accept arbitrary `response_type: str`; tests therefore keep ACK/control messages in the outgoing schema registry so emitted first-party backend websocket types remain contract-covered.

Result:

- stop/settings/model ACK messages are valid transport envelopes and part of the outgoing schema contract table.

Any truly ad hoc helper response type should either become a schema-backed
outgoing contract or stay out of first-party renderer/SDK event consumers.

## Registry Alignment Semantics

`validate_registry_alignment()` in `api/contracts/registry.py` checks:

- incoming/outgoing constant tuples and contract tables are duplicate-free
- incoming contract table vs `INCOMING_MESSAGE_TYPES`
- outgoing schema contract table vs `OUTGOING_SCHEMA_MESSAGE_TYPES`

First-party outgoing constants that are emitted over the backend websocket
should exist in outgoing schema contracts unless they are explicitly documented
as local-only helper sentinels.

## Handler Emitters for ACK/control Types

`backend/src/api/handlers/settings.py` emits:

- `settings-loaded` (`LoadSettingsHandler`)
- `models-listed` (`ListModelsHandler`)
- `settings-updated` (`UpdateSettingsHandler`)

`backend/src/api/handlers/stop_query.py` emits:

- `stop-query-ack` (`StopQueryHandler`)

Responses still use canonical envelope shape:

- `{type, id, payload}` plus optional context fields

`tests/backend/test_api_handlers.py` asserts these exact `type` values.

## Test-Backed Envelope Behavior

`tests/backend/test_transport_envelope.py` and `tests/backend/test_api_errors.py` verify:

- ACK/control types like `stop-query-ack`, `settings-updated`, and `settings-loaded` are supported by transport helpers and schema contracts
- context fields attach only when truthy
- helper send paths swallow expected closed-connection/runtime send failures

## Drift Hotspots

1. adding a new outgoing constant but forgetting to decide whether it is a first-party websocket event contract
2. adding schema model for new outgoing type but not adding to `OUTGOING_SCHEMA_MESSAGE_TYPES`
3. updating settings/model handler response type string without updating `OutgoingMessageType`
4. hardcoding literal strings in handlers instead of constants

## Debug Checklist

If registry alignment fails:

1. compare `OUTGOING_SCHEMA_CONTRACTS` to `OUTGOING_SCHEMA_MESSAGE_TYPES`
2. confirm new constant is intended as schema type vs ACK/control type

If renderer receives unexpected/untyped settings/model events:

1. verify emitted type matches constants (`settings-loaded`, `settings-updated`, `models-listed`)
2. verify SDK/renderer consumer paths listen for non-stream ACK/control message types

## Related Pages

- [Backend Contracts Message Types Docs Hub](README.md)
- [Backend Contracts Docs Hub](../README.md)
- [Message Schema and Formatter Reference](../message_schema_and_formatter_reference.md)
- [WebSocket Message Contracts](../websocket_message_contracts.md)
