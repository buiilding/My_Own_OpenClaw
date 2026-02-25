---
summary: "Deep reference for `content_to_message_content` parsing semantics: text-part aggregation, first-image selection, invalid-part filtering, fallback string conversion, plus core type-alias export boundaries."
read_when:
  - When changing message content conversion from raw LLM payloads to `MessageContent` wrappers.
  - When debugging multimodal content parsing, missing image URLs, or type alias import/export usage in core types package.
title: "Content Converter Parsing, First-Image Selection, and Type-Alias Export Contract Reference"
---

# Content Converter Parsing, First-Image Selection, and Type-Alias Export Contract Reference

## Canonical Modules

- `backend/src/core/messages/converters.py`
- `backend/src/core/messages/structures.py`
- `backend/src/core/messages/__init__.py`
- `backend/src/core/types/aliases.py`
- `backend/src/core/types/__init__.py`
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
- returns `ImageContent(joined_text, first_image_url)` when at least one valid image URL exists
- otherwise returns `TextContent(joined_text)`

Important behavior:

- only first valid image URL is used; additional image parts are ignored
- invalid parts/non-dict parts are ignored safely

## `MessageContent` Polymorphism Contract

Concrete content wrappers:

- `TextContent`
  - `to_llm_format() -> str`
  - `get_text()` returns original text

- `ImageContent`
  - `to_llm_format() -> [{type:text}, {type:image_url}]`
  - `has_image() -> true`
  - `get_image_urls()` returns single-element list

## Alias and Export Boundary Contract

Type aliases in `core/types/aliases.py`:

- `JSONDict = Dict[str, Any]`
- `StringDict = Dict[str, str]`

Exports:

- aliases re-exported by `core/types/__init__.py`
- message wrappers + converter re-exported by `core/messages/__init__.py`

Practical contract:

- import paths through package `__init__` files are part of public core API surface.

## Test-Backed Matrix

`tests/backend/test_messages_and_converters.py` verifies:

- text-only conversion
- multimodal conversion with text aggregation + first-image selection
- invalid-part tolerance
- fallback conversion for non-list/non-string objects via `str()`

## Drift Hotspots

1. Switching from first-image selection to all-images output changes `ImageContent` shape and downstream assumptions.
2. Altering text join delimiter can shift prompt tokenization and display parity.
3. Removing package-level alias/message exports can break import stability across modules.

## Related Pages

- [Backend Core Messages Docs Hub](README.md)
- [Stored Message LLM Serialization, Tool-Call Normalization, and Multimodal Image Contract Reference](stored_message_llm_serialization_tool_call_normalization_and_multimodal_image_contract_reference.md)
- [Prompt Constructor and Transparency Metadata Reference](../../llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
