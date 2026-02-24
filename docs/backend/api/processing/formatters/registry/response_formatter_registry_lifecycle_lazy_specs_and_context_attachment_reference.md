---
summary: "Deep reference for formatter registration source-of-truth, lazy/cached spec loading, typed-vs-dict dispatch precedence, and transport context field attachment semantics."
read_when:
  - When adding a new stream event formatter or changing event-to-outgoing message type mapping.
  - When triaging missing formatter routes, duplicate registration exceptions, or absent `session_id`/`turn_ref` in stream envelopes.
title: "Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference"
---

# Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference

## Canonical Modules

- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/contracts/message_types.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_api_contract_registry.py`

## One Source, Two Surfaces

`formatter_specs.get_formatter_specs()` defines canonical tuples:

- `(event_class, stream_event_type_literal, formatter_class, outgoing_message_type_literal)`

This one tuple list powers two independent consumers:

- runtime dispatch: `ResponseFormatter._register_formatters()`
- contract validation: registry/tests asserting spec-to-schema alignment

Because both paths consume the same source, spec drift appears early as test failure or formatter-construction exception.

## Lazy Import and Cache Behavior

Why lazy imports exist in `formatter_specs.py`:

- avoid import cycle through `backend.src.api.processing.__init__`
- keep formatter/event class imports local to first spec load

`@lru_cache(maxsize=1)` behavior:

- first call resolves/imports classes and freezes tuple set
- repeated calls reuse same tuple object
- runtime avoids repeated import and tuple rebuild cost

Operational nuance:

- spec changes in-process require cache invalidation/restart; hot-patching without process restart can keep stale mapping in memory

## ResponseFormatter Registration Lifecycle

`ResponseFormatter.__init__()` sequence:

1. initialize empty `_formatters: Dict[str, EventFormatter]`
2. initialize empty `_typed_formatters: Dict[type, EventFormatter]`
3. `_register_formatters()` iterates spec tuples and instantiates formatter classes

Registration guards:

- duplicate stream `event_type` key => `ValueError("Duplicate formatter registration for type: ...")`
- duplicate typed `event_class` key => `ValueError("Duplicate formatter registration for class: ...")`

These are construction-time failures, not deferred runtime errors.

## Dispatch Precedence and Compatibility Mode

`ResponseFormatter.format(event, msg_id, context)` order:

1. exact typed lookup: `_typed_formatters.get(type(event))`
2. dict compatibility lookup: `_formatters.get(event.get("type"))` when `event` is `dict`
3. no route => `None`

Important precision detail:

- typed dispatch uses exact class identity (`type(event)`), not `isinstance` polymorphism
- subclassed events require explicit spec entries if class differs

Dict route role:

- backward compatibility for legacy dict events
- shares same formatter instances as typed map, so behavior stays coherent across both ingress shapes

## Context Attachment Boundary

`ResponseFormatter` delegates to `_attach_context(...)`, then `attach_context_fields(...)`.

Attach occurs only when:

- formatter returned non-`None` response, and
- caller passed non-empty `context`

Fields considered:

- `session_id`
- `user_id`
- `conversation_ref`
- `turn_ref`

Falsy values are omitted. This means empty-string IDs are intentionally not emitted.

## Skip vs Send Consequences

Formatter return `None` semantics:

- event treated as skipped
- no context attach attempt
- no transport send for that event in `StreamPipeline.process(...)`

Debug implication:

- missing context on a specific event may actually be a missing event (formatter skip), not envelope bug

## Contract/Test Anchors

`tests/backend/test_response_formatter.py` locks:

- typed event formatting path
- dict compatibility path
- unknown event returns `None`
- context attaches on success only
- duplicate type/class registration hard-fails

`tests/backend/test_api_contract_registry.py` locks:

- formatter spec classes/types align with live `ResponseFormatter` maps
- spec outgoing message types are subset of outgoing schema message-type registry

This couples formatter registration, schema constants, and contract tables as a single guarded surface.

## Drift Hotspots

1. adding formatter class but forgetting spec entry => formatter never reachable.
2. adding spec with duplicate event type/class => constructor failure at startup/test.
3. changing outgoing type constant in spec but not outgoing schema contracts => registry alignment failure.
4. introducing subclass event without explicit spec => typed dispatch miss despite similar fields.
5. passing empty context identifiers => omitted envelope fields by falsy guard.

## Change Checklist

When adding a new event formatter:

1. add tuple to `get_formatter_specs()`
2. ensure outgoing message type constant exists in canonical message-type sets
3. add/extend formatter output schema contract tests
4. add typed and dict-path dispatch tests when compatibility is required

When changing context behavior:

1. update `attach_context_fields(...)` rules
2. verify expected omitted-vs-present semantics for falsy values
3. validate frontend conversation/turn gating still receives required IDs
