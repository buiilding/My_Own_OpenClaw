---
summary: "Backend core message docs sub-hub for stored message serialization, multimodal content conversion, and message type alias export contracts."
read_when:
  - When changing `backend/src/core/messages/*` or message representation sent into prompt construction/history.
  - When debugging screenshot multimodal conversion, tool-call normalization, or message-content parser behavior.
title: "Backend Core Messages Docs Hub"
---

# Backend Core Messages Docs Hub

## Deep Pages

- [Stored Message LLM Serialization, Tool-Call Normalization, and Multimodal Image Contract Reference](stored_message_llm_serialization_tool_call_normalization_and_multimodal_image_contract_reference.md)
- [Content Converter Parsing, First-Image Selection, and Type-Alias Export Contract Reference](content_converter_parsing_first_image_selection_and_type_alias_export_contract_reference.md)

## Related Pages

- [Backend Core Infrastructure Docs Hub](../README.md)
- [Conversation History and Prompt Context Runtime Reference](../../runtime/conversation_history_and_prompt_context_runtime_reference.md)
- [Prompt Constructor and Transparency Metadata Reference](../../llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
- [Streaming Event Dataclass and Enum Semantics Reference](../../contracts/events/streaming_event_dataclass_and_enum_semantics_reference.md)

## Code Scope

- `backend/src/core/messages/__init__.py`
- `backend/src/core/messages/structures.py`
- `backend/src/core/messages/converters.py`
- `backend/src/core/types/aliases.py`
- `backend/src/core/types/__init__.py`
- `tests/backend/test_messages_and_converters.py`
- `tests/backend/test_interaction_loop.py`
