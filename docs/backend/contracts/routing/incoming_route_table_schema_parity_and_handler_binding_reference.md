---
summary: "Deep reference for core incoming route-table semantics: schema literal introspection, duplicate/mismatch guards, shared-handler-key bindings, and API container wiring."
read_when:
  - When modifying `INCOMING_ROUTES`, `IncomingMessage` unions, or API container handler keys.
  - When diagnosing route-table mismatch, duplicate-type, or missing-handler startup errors.
title: "Incoming Route Table, Schema Parity, and Handler-Binding Reference"
---

# Incoming Route Table, Schema Parity, and Handler-Binding Reference

## Canonical Modules

- `backend/src/core/container/incoming_routing.py`
- `backend/src/core/container/api_container.py`
- `backend/src/api/schema.py`
- `backend/src/api/schemas/incoming.py`
- `tests/backend/test_incoming_routing.py`

## Route Table Source of Truth

`INCOMING_ROUTES` is the canonical runtime table mapping incoming websocket `type` literals to container handler keys.

Current mappings:

- `query` -> `query_handler`
- `stop-query` -> `stop_query_handler`
- `rehydrate-conversation` -> `rehydrate_conversation_handler`
- `tool-result` -> `tool_result_handler`
- `tool-bundle-result` -> `tool_result_handler` (shared key)
- `wakeword-detected` -> `wakeword_handler`
- `list-models` -> `list_models_handler`
- `load-settings` -> `load_settings_handler`
- `update-settings` -> `update_settings_handler`

The table lives in `core/container` so it can be validated before API registry assembly.

## Schema Literal Introspection Path

`get_incoming_message_types()` derives valid literals from the `IncomingMessage` discriminated union:

1. accepts `Annotated[Union[...], ...]` and plain `Union[...]`
2. iterates each model's `type` field annotation
3. requires `Literal[...]` annotations
4. collects every declared literal value into a set

If any model `type` field is non-literal, it raises:

- `ValueError("Incoming message model <name> has non-literal type field: ...")`

This prevents fail-open routing on loosely typed schema declarations.

## Route Validation Invariants

`validate_incoming_routes()` enforces:

1. no duplicate `message_type` entries in `INCOMING_ROUTES`
2. exact set equality between route-table types and schema-derived types

Failure modes:

- duplicate route types:
  - `ValueError("Duplicate incoming route message types in INCOMING_ROUTES: [...]")`
- schema mismatch:
  - `ValueError("Incoming route table does not match incoming schema types. missing=[...], extra=[...]")`

This is intentionally strict and blocks startup/wiring on drift.

## Handler-Binding Construction

`build_handler_bindings(handlers_by_key)` flow:

1. runs `validate_incoming_routes()`
2. verifies every `handler_key` used by routes exists in `handlers_by_key`
3. returns ordered tuple of `(message_type, handler_instance)` from route table

Missing key raises:

- `ValueError("Missing handler instances for route keys: [...]")`

Route order is preserved in returned tuple.

## Shared Handler-Key Semantics

The routing layer supports multiple message types pointing to one handler instance.

Current intentional shared binding:

- `tool-result` and `tool-bundle-result` -> same `tool_result_handler`

`tests/backend/test_incoming_routing.py` explicitly verifies this behavior.

## API Container Integration

`ApiContainer._create_handler_registry(...)`:

1. constructs concrete handler instances
2. builds bindings via `build_handler_bindings(...)`
3. registers each binding into `MessageHandlerRegistry`

This removes duplicated hard-coded `registry.register("<type>", <handler>)` strings and centralizes contract drift checks in one table.

## Test-Backed Guarantees

`tests/backend/test_incoming_routing.py` covers:

- route-table and schema-literal parity
- duplicate route-type rejection
- missing/extra schema-type mismatch rejection
- non-literal schema `type` field rejection
- support for non-`Annotated` union shape
- shared handler-key mapping
- binding-order preservation
- missing handler-key failure path

## Drift Hotspots

1. adding a new incoming schema type but forgetting to update `INCOMING_ROUTES`
2. adding a route using wrong hyphen/underscore literal
3. renaming handler provider key in `ApiContainer` but not route table `handler_key`
4. changing union wrapper shape and breaking literal extraction assumptions

## Debug Checklist

When startup fails with routing errors:

1. compare `IncomingMessage` schema literals to `INCOMING_ROUTES` types
2. check for duplicate `message_type` rows
3. verify `ApiContainer` provides all route `handler_key` names
4. verify new message type uses exact canonical literal (`-` vs `_`)

## Related Pages

- [Backend Contracts Routing Docs Hub](README.md)
- [Backend Contracts Docs Hub](../README.md)
- [WebSocket Message Contracts](../websocket_message_contracts.md)
- [Handler Registry and Error Envelope Reference](../../api/handler_registry_and_error_envelope_reference.md)
