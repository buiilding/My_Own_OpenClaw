---
summary: "Backend validation boundary reference for websocket envelopes: field validators, handshake/user-id enforcement, discriminated schema parsing, route-table guards, and contract registry parity checks."
read_when:
  - When modifying websocket message field constraints, parser validation flow, or schema strictness.
  - When adding message types and ensuring route-table + contract registry fail-fast alignment checks stay correct.
title: "Backend Message Envelope and Contract Validation Boundary Reference"
---

# Backend Message Envelope and Contract Validation Boundary Reference

## Scope and Sources

Validation boundary sources:

- Envelope primitives: `backend/src/api/schemas/common.py`
- Incoming schema union: `backend/src/api/schemas/incoming.py`, `backend/src/api/schema.py`
- Parse + adapter validation flow: `backend/src/api/routes/websocket/message_handler.py`, `backend/src/api/routes/websocket/json_parse.py`
- Shared validators: `backend/src/core/validation/validators.py`
- Incoming route-table validation: `backend/src/core/container/incoming_routing.py`
- Contract-registry parity checks: `backend/src/api/contracts/registry.py`, `backend/src/api/contracts/message_types.py`

## Envelope Validation Rules (`BaseMessage`)

`BaseMessage` is the post-handshake websocket envelope contract.

Required keys:

- `id: str`
- `type: str`
- `payload: dict`
- `user_id: str`

Optional context keys:

- `session_id`
- `conversation_ref`
- `turn_ref`
- `timestamp`

Strictness:

- `model_config = ConfigDict(extra='forbid')` (unknown top-level keys rejected).

### `id` field constraints

`validate_msg_id(...)` enforces:

- non-empty/non-whitespace
- max length `128`
- regex `^[a-zA-Z0-9_-]+$`

### `user_id` constraints

`validate_user_id(...)` shared rule rejects:

- empty string
- whitespace-only
- literal `'default_user'`

## Handshake Validation Boundary

`HandshakeMessage` validation runs before normal message loop.

Contract:

- `type` must be literal `handshake`
- `user_id` passes same shared validator
- unknown handshake keys rejected (`extra='forbid'`)

Failure effect:

- connection close with policy violation (`1008`) via handshake failure path.

## Incoming Payload Parse/Validation Pipeline

`parse_and_validate_message(...)` pipeline:

1. max-byte check vs `max_message_size`
2. parse JSON with object-root requirement
3. inject connection-context `user_id` into parsed object
4. validate via pre-allocated `TypeAdapter(IncomingMessage)`

### Incoming union discriminator contract

`IncomingMessage` is a discriminated union by `type` literal.

Effect:

- type not in union -> schema validation failure
- payload shape mismatch for known type -> schema validation failure
- client gets formatted validation message list from pydantic errors

### Parse offload policy

`parse_json_object_payload(...)` offloads large parses to threadpool when payload bytes >= `64 * 1024`, reducing event-loop blocking risk.

## Schema Strictness Matrix (high-level)

| Model group | `extra` behavior | Reason |
|---|---|---|
| `BaseMessage`, most incoming payloads | `forbid` | strict protocol envelope and core payload keys |
| `ToolResultData`, `ToolBundleStepResult` | `allow` | tool-specific dynamic fields allowed |
| outgoing `ToolCallPayload`, `ToolOutputPayload` | `allow` | formatter/tool metadata passthrough compatibility |

## Route-Table Validation Guard

`validate_incoming_routes()` fail-fast checks in `incoming_routing.py`:

- no duplicate `message_type` entries in route table
- route table types exactly match incoming schema union literals (`missing`/`extra` detected)

`build_handler_bindings(...)` also enforces all required handler keys are present in DI map.

Impact:

- startup fails early on schema/route drift.

## Contract Registry Parity Guard

`validate_registry_alignment()` checks:

- `INCOMING_CONTRACTS` types == `INCOMING_MESSAGE_TYPES`
- `OUTGOING_SCHEMA_CONTRACTS` types == `OUTGOING_SCHEMA_MESSAGE_TYPES`

Purpose:

- catches constant-list drift vs schema registry declarations.
- protects formatter/schema parity tests and runtime assumptions.

## Frontend Config Patch Validation Boundary

`validate_frontend_config(...)` guardrails for `update-settings` payloads:

- input must be dict
- unknown keys logged and ignored
- allowed keys validated through typed `FrontendConfigPatch`
- output only includes explicitly-set keys (`exclude_unset=True`)

Role in protocol surface:

- frontend cannot patch arbitrary backend config fields through websocket settings updates.

## Drift Checks

When editing validation logic, verify:

- `BaseMessage` and handshake `user_id` rules remain aligned.
- incoming schema union literals stay synchronized with route table and incoming constants.
- outgoing schema subset list and contract registry still match.
- parse-size/error strings remain compatible with frontend error-handling expectations.
