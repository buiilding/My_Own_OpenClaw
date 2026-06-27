---
summary: "Deep reference for `content_to_message_content` parsing semantics: text-part aggregation, multi-image preservation, invalid-part filtering, and fallback string conversion."
read_when:
  - When changing message content conversion from raw LLM payloads to `MessageContent` wrappers.
  - When debugging multimodal content parsing or missing image URLs.
title: "Content Converter Parsing and Multi-Image Preservation Reference"
---

# Content Converter Parsing and Multi-Image Preservation Reference

## Canonical Modules

- `backend/src/core/messages/converters.py`
- `backend/src/core/messages/structures.py`
- `tests/backend/test_messages_and_converters.py`

## Converter Input Contract

`content_to_message_content(content)` accepts:

- `str` -> returns `TextContent`
- multimodal list entries (`MultimodalContent`) -> parses typed dict parts
- other values -> converts with `str(content)` and wraps in `TextContent`

## Multimodal Parse Semantics

For list payloads:

- collects all `{"type":"text"}` `text` segments
- joins text segments with single-space delimiter
- collects valid image URLs from `{"type":"image_url","image_url":{"url":...}}`
- returns `ImageContent(joined_text, image_urls)` when at least one valid image URL exists
- otherwise returns `TextContent(joined_text)`

Important behavior:

- all valid image URLs are preserved in source order
- invalid parts/non-dict parts are ignored safely

## `MessageContent` Polymorphism Contract

Concrete content wrappers:

- `TextContent`
  - `to_llm_format() -> str`
  - `get_text()` returns original text

- `ImageContent`
  - `to_llm_format() -> [{type:text}, {type:image_url}, ...]`
  - `has_image() -> true`
  - `get_image_urls()` returns every valid image URL in source order

## Test-Backed Matrix

`tests/backend/test_messages_and_converters.py` verifies:

- text-only conversion
- multimodal conversion with text aggregation + multi-image preservation
- invalid-part tolerance
- fallback conversion for non-list/non-string objects via `str()`

## Drift Hotspots

1. Reintroducing first-image selection would drop user/tool multimodal context.
2. Altering text join delimiter can shift prompt tokenization and display parity.
3. Reintroducing package-level alias/message exports can hide the concrete owner
   module for message contracts.

## Related Pages

- [Backend Core Messages Docs Hub](README.md)
- [Stored Message LLM Serialization, Tool-Call Normalization, and Multimodal Image Contract Reference](stored_message_llm_serialization_tool_call_normalization_and_multimodal_image_contract_reference.md)
- [Prompt Constructor and Transparency Metadata Reference](../../llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
