---
summary: "Deep reference for browser_use tools registry internals: action signature normalization, special-parameter injection, runtime validation/dispatch, sensitive-data placeholder replacement, and domain-gated action availability."
read_when:
  - When changing action registration/execution internals in `tools/registry/service.py`.
  - When debugging action schema generation, missing special-param errors, or secret placeholder replacement behavior.
title: "Browser Use Tools Registry Signature Normalization, Sensitive Placeholder, and Domain Filter Contract Reference"
---

# Browser Use Tools Registry Signature Normalization, Sensitive Placeholder, and Domain Filter Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/tools/registry/views.py`
- `frontend/src/main/python/tools/browser/browser_use/tools/registry/service.py`

## Registry Model Layer (`registry/views.py`)

Core models:

- `RegisteredAction`: action metadata (name/description/function/param model/domain filters/terminates_sequence)
- `ActionModel`: base dynamic action union model with helper `get_index()` / `set_index()`
- `ActionRegistry`: mapping container + prompt-description filtering
- `SpecialActionParameters`: injected special-parameter surface

Domain filter behavior is centralized via `_match_domains(...)` and `match_url_with_domain_pattern(...)`.

Prompt-description split contract:

- system prompt (`page_url=None`) includes actions without domain filters
- page-specific prompt includes only filtered actions whose domain patterns match current URL

## Signature Normalization (`Registry._normalize_action_function_signature`)

Action functions are normalized into kwargs-only wrappers.

Supported source styles:

- Type 1: explicit Pydantic param-model argument + special params
- Type 2: plain explicit action params (auto-wrapped into generated param model)

Normalization guarantees:

- rejects `**kwargs` in original function signature
- validates special-parameter type compatibility for reserved names
- converts wrapper signature to keyword-only `params` + keyword-only special params + ignored extra kwargs
- ensures required special params throw consistent errors when missing

## Special Parameter Injection Contract

Injected special names include:

- `browser_session`
- `page_url`
- `cdp_client`
- `page_extraction_llm`
- `file_system`
- `available_file_paths`
- `has_sensitive_data`
- `extraction_schema`
- `context`

`execute_action(...)` composes this context and only injects `sensitive_data` for `input` action.

## Action Registration and Exclusion

`Registry.action(...)` decorator flow:

1. enforce `domains` vs `allowed_domains` alias mutual exclusivity
2. skip registration when function name appears in `exclude_actions`
3. normalize signature + resolve/derive param model
4. store `RegisteredAction`

`exclude_action(...)` can remove actions post-registration and also prevents future re-registration.

## Action Execution Path (`execute_action`)

Execution stages:

1. validate incoming params with action param model
2. optionally replace secrets in validated params
3. build special context dictionary
4. call normalized action function with `params=` and injected context
5. wrap failures into runtime errors with action name context

Validation errors are surfaced as runtime errors with explicit parameter payload context.

## Sensitive Placeholder Replacement

`_replace_sensitive_data(...)` supports both legacy and domain-scoped secret maps:

- legacy: `{key: value}`
- domain-scoped: `{domain_pattern: {key: value}}`

Replacement behavior:

- replaces `<secret>name</secret>` placeholders recursively across strings/dicts/lists
- also replaces exact literal placeholder text when model omitted secret tags
- supports dynamic TOTP generation for placeholders ending in `bu_2fa_code`
- logs used placeholders and warns for missing placeholders

Domain-scoped secrets are only applied when current URL matches domain glob and URL is not a new-tab placeholder page.

## Dynamic Action Model Creation

`create_action_model(...)` builds action schemas for tool-calling backends:

- filters available actions by include list + domain rules
- creates one individual action model per action
- returns either single model or `RootModel[Union[...]]`
- union wrapper delegates `get_index`, `set_index`, and `model_dump` to active root action payload

This keeps agent-facing action schema narrow while preserving helper APIs expected by caller code.

## Telemetry Stub Contract

Vendored runtime uses local no-op `ProductTelemetry` for Browser Use telemetry hooks.

- `capture(...)` and `flush(...)` are intentional no-ops in WindieOS vendored environment

## Related Docs

- [Browser Use Tools Action Model Surface and Input Schema Contract Reference](action_model_surface_and_input_schema_contract_reference.md)
- [Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference](runtime_action_dispatch_extraction_and_codeagent_variant_contract_reference.md)
