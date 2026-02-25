---
summary: "Deep reference for `StoredMessage` serialization: role-specific llm message shape, assistant tool-call normalization defaults, tool-role fallback tool_call_id, and image_data multimodal conversion rules."
read_when:
  - When changing `StoredMessage.to_llm_message` role branching or tool-call normalization behavior.
  - When debugging missing screenshot content, malformed assistant tool calls, or tool message `tool_call_id` fallback behavior.
title: "Stored Message LLM Serialization, Tool-Call Normalization, and Multimodal Image Contract Reference"
---

# Stored Message LLM Serialization, Tool-Call Normalization, and Multimodal Image Contract Reference

## Canonical Modules

- `backend/src/core/messages/structures.py`
- `backend/src/core/types/enums.py`
- `backend/src/core/types/schemas.py`
- `tests/backend/test_messages_and_converters.py`

## `StoredMessage` Role-Based Serialization Contract

`StoredMessage.to_llm_message()` branches by role/fields:

1. assistant with `tool_calls`:
- returns `role`, `content`, normalized `tool_calls`
- includes `name` only when `tool_name` present

2. tool role:
- returns `role`, `content`, `tool_call_id`
- fallback `tool_call_id="unknown_tool_call"` when missing
- includes `name` when `tool_name` present

3. any message with `image_data`:
- returns multimodal `content` list with text + image_url entries
- adds `data:image/png;base64,` prefix if missing
- preserves existing `data:image/...` prefix when already present

4. fallback path:
- returns simple text message with `role` and `content`

## Assistant Tool-Call Normalization Contract

`_normalize_tool_calls(tool_calls)` behavior:

- skips non-dict entries
- fills missing/invalid `id` with `tool_call_<index>`
- fills missing/invalid `name` with `unknown_tool`
- coerces non-dict `arguments` to `{}`
- returns list of normalized call dicts with keys: `id`, `name`, `arguments`

This guarantees assistant tool-call history sent to models is structurally stable.

## Structured Query Fields Contract

`StoredMessage` includes explicit structured query fields used by history/runtime layers:

- `user_query_raw`
- `episodic_memory`
- `semantic_memory`
- `injected_context`

Design intent: avoid lossy parse-back from rendered XML/text when preserving user-query structure.

## Test-Backed Matrix

`tests/backend/test_messages_and_converters.py` verifies:

- text-only serialization
- image prefix add/preserve behavior
- assistant tool-call normalization including skipped invalid entries
- tool role fallback `unknown_tool_call` behavior

Additional usage coverage:

- `tests/backend/test_interaction_loop.py` consumes stored history path via `StoredMessage` semantics indirectly.

## Drift Hotspots

1. Changing tool-call default IDs/names breaks deterministic fallback behavior in model-facing history.
2. Removing image prefix normalization can produce invalid multimodal image URLs.
3. Changing role-branch priority can alter assistant/tool message envelopes in prompt history.

## Related Pages

- [Backend Core Messages Docs Hub](README.md)
- [Content Converter Parsing, First-Image Selection, and Type-Alias Export Contract Reference](content_converter_parsing_first_image_selection_and_type_alias_export_contract_reference.md)
- [Conversation History and Prompt Context Runtime Reference](../../runtime/conversation_history_and_prompt_context_runtime_reference.md)
