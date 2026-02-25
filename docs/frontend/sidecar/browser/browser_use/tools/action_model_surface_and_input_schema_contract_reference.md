---
summary: "Deep reference for browser_use tool action input models and extraction metadata schemas: action parameter envelopes, structured-output surface, and schema-to-runtime extraction result typing."
read_when:
  - When changing action parameter models in `tools/views.py`.
  - When debugging extraction schema mismatch behavior or structured extraction metadata shape.
title: "Browser Use Tools Action Model Surface and Input Schema Contract Reference"
---

# Browser Use Tools Action Model Surface and Input Schema Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/tools/views.py`
- `frontend/src/main/python/tools/browser/browser_use/tools/extraction/views.py`
- `frontend/src/main/python/tools/browser/browser_use/tools/extraction/schema_utils.py`

## Action Input Model Surface (`tools/views.py`)

`tools/views.py` defines the Pydantic request model contract used by registry action schemas.

Major groups:

- navigation/search: `SearchAction`, `NavigateAction`, `SearchPageAction`, `FindElementsAction`
- interaction: `ClickElementAction`, `InputTextAction`, `ScrollAction`, `SendKeysAction`, `UploadFileAction`
- tab/dropdown: `SwitchTabAction`, `CloseTabAction`, `GetDropdownOptionsAction`, `SelectDropdownOptionAction`
- extraction/completion: `ExtractAction`, `ReadContentAction`, `DoneAction`, `StructuredOutputAction[T]`
- utility no-arg shells: `NoParamsAction`, `ScreenshotAction`

Compatibility aliases maintained in-model:

- `GoToUrlAction = NavigateAction`

`ClickElementActionIndexOnly` keeps schema title compatibility (`ClickElementAction`) while forcing index-only payloads.

## Structured Output Action Contract

`StructuredOutputAction[T]` has two fields:

- `success`
- `data` (typed payload)

JSON schema behavior:

- `_hide_success_from_schema(...)` removes `success` from schema properties to avoid collisions when user output schema also defines `success`.

This keeps runtime success tracking while simplifying model-facing structured output expectations.

## Extraction Result Metadata Envelope (`extraction/views.py`)

`ExtractionResult` is the typed metadata envelope stored in `ActionResult.metadata` for structured extraction runs.

Fields:

- `data`: validated extraction payload
- `schema_used`: active JSON schema
- `is_partial`: chunk truncation indicator
- `source_url`: source url when available
- `content_stats`: extraction preprocessing/chunk stats

Model config is `extra='forbid'` to enforce strict metadata shape.

## Runtime JSON-Schema-to-Pydantic Conversion (`schema_utils.py`)

`schema_dict_to_pydantic_model(schema)` converts extraction JSON schema into runtime Pydantic models.

### Supported core behavior

- top-level schema must be `type=object` with non-empty `properties`
- primitive mapping: string/number/integer/boolean/null
- nested objects recursively become nested models
- arrays map to `list[item_type]`
- optional nullability supports `| None`

### Unsupported feature boundary

Raises `ValueError` for unsupported composition/reference keywords, including:

- `$ref`
- `allOf` / `anyOf` / `oneOf` / `not`
- `$defs` / `definitions`
- conditional/dependent schema keywords

### Defaulting policy

For non-required fields without explicit defaults:

- primitives use zero-value defaults
- arrays use empty-list defaults (`default_factory=list`)
- enums and nested object types are widened to nullable and default to `None`

This favors extraction resilience over strict missing-field failure.

## Contract Implications for Tooling

- registry-generated action schemas are only as strict as these Pydantic models
- extraction structured-output correctness depends on `schema_utils.py` accepted subset
- complex JSON Schema composition features are intentionally blocked at runtime and silently require caller schema simplification

## Related Docs

- [Browser Use Tools Registry Signature Normalization, Sensitive Placeholder, and Domain Filter Contract Reference](registry_signature_normalization_sensitive_placeholder_and_domain_filter_contract_reference.md)
- [Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference](runtime_action_dispatch_extraction_and_codeagent_variant_contract_reference.md)
