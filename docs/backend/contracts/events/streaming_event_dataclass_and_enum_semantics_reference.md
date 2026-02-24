---
summary: "Deep reference for streaming event dataclass contracts, base `to_dict` behavior, event-specific overrides/defaults, and enum literal naming conventions."
read_when:
  - When adding/modifying streaming event dataclasses.
  - When debugging serialized event payload fields before formatter dispatch.
title: "Streaming Event Dataclass and Enum Semantics Reference"
---

# Streaming Event Dataclass and Enum Semantics Reference

## Canonical Modules

- `backend/src/core/events/streaming_events.py`
- `backend/src/core/types/enums.py`
- `tests/backend/test_events.py`

## Base Event Model

`StreamingEvent` base class contract:

- `type` field set in subclass `__post_init__`
- `to_dict()` always includes:
  - `"type": self.type.value`
- all other instance fields are copied verbatim into output dict

No deep transformation is applied in base `to_dict()`:

- nested dict/list structures are preserved as-is

## Event Dataclass Defaults and Overrides

Notable per-event defaults:

- `StreamingCompleteEvent.final_response` defaults to `None`
- `ToolCallEvent.request_id` defaults to `None`
- `ToolCallEvent.metadata` defaults to `None`
- `ToolOutputEvent` optional fields default to `None`
- `MemoryStoreEvent.user_id` defaults to `"default_user"`
- `MemoryStoreEvent.session_id` defaults to `None`

Special serialization override:

- `StreamingCompleteEvent.to_dict()` omits `final_response` key when value is `None`

All other event classes use base `to_dict()` behavior.

## Enum Literal Conventions (`StreamingEventType`)

Enum values are mixed-format by design:

- snake case: `tool_call`, `tool_output`, `token_count`, `user_message_full`
- kebab case: `streaming-complete`, `memory-store`, `tool-bundle`
- plain: `chunk`, `thinking`, `error`, `content`

Important literals:

- `FULL_RESPONSE = "full_response"` (internal/full-text event type)
- `CONTENT = "content"` (LLM-client internal stream token alias)

Consumers must not assume one global separator style.

## Test-Backed Semantics

`tests/backend/test_events.py` verifies:

- each dataclass sets expected enum value
- `to_dict()` includes expected required fields
- `StreamingCompleteEvent` conditional `final_response` serialization
- nested dict/list preservation in `to_dict()`
- `MemoryStoreEvent` default user/session behavior

## Drift Hotspots

1. changing enum literal strings without updating formatter specs and event guards
2. removing `StreamingCompleteEvent.to_dict()` override and emitting unexpected `final_response: null`
3. changing `MemoryStoreEvent.user_id` default without handling formatter policy rejection
4. adding event fields assuming formatter/schema will accept them automatically

## Debug Checklist

If an event reaches formatter with unexpected shape:

1. inspect dataclass defaults and constructor call-site values
2. inspect base vs overridden `to_dict()` path
3. verify enum literal emitted by `type.value` is what dispatch expects

If event type appears correct but downstream mapping fails:

1. compare enum literal against `formatter_specs` event type string
2. check whether event class is included in `AgentStreamingEvent` union and formatter map
3. check for mixed separator mismatch (`_` vs `-`) in literal comparisons
