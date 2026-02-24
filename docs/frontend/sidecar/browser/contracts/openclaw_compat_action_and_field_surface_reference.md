---
summary: "Deep reference for sidecar BrowserOpenClawCompatArgs action literals, field alias families, and compatibility-only payload semantics consumed by adapter/runtime layers."
read_when:
  - When changing OpenClaw compatibility action names or payload aliases (`targetId`, `targetUrl`, `inputRef`, etc.).
  - When debugging compatibility action payload shape issues for `act`, tab aliases, storage/emulation fields, or Browser Use file operations.
title: "OpenClaw Compatibility Action and Field Surface Reference"
---

# OpenClaw Compatibility Action and Field Surface Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/browser_adapter.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`

## Compatibility Action Literal Set

`BrowserOpenClawCompatArgs.action` supports:

- `status`, `profiles`, `open`, `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `input`, `send_keys`, `switch`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`, `act`

`OPENCLAW_COMPAT_ACTIONS` is derived dynamically from that annotation (`typing.get_args(...)`) and then reused in schema registry wiring.

## Field Families

### Identifier aliases

- tab aliases: `target_id`, `targetId`, `tab_id`
- URL aliases: `url`, `target_url`, `targetUrl`
- input aliases: `input_ref`, `inputRef`

### Search/find payloads

- `query`, `pattern`, `regex`, `case_sensitive`, `context_chars`, `css_scope`, `max_results`, `attributes`, `include_text`

### Snapshot/extract compat fields

- `snapshotFormat`
- `mode` compatibility values (`user_chrome`, `managed`, `efficient`, `focused`, `full_text`, `structured`)

### Interaction payloads

- `index`, `text`, `keys`, `code`, `down`, `pages`
- nested envelope: `request` for `act`

### File-operation payloads

- `file_name`, `content`, `append`, `trailing_newline`, `leading_newline`, `old_str`, `new_str`, `path`, `goal`, `source`, `context`

### Session/diagnostic/emulation fields

- timeout/dialog aliases (`timeoutMs`, `timeout_ms`, `promptText`, `prompt_text`)
- storage/network/emulation fields (`cookies`, `kind`, `values`, `headers`, `offline`, geolocation/media/color/timezone/locale/device)

### Legacy passthrough placeholders

Fields retained as compatibility placeholders but unused by Windie runtime semantics:

- `profile`, `node`, `target` (`sandbox|host|node`)

## Schema Behavior

- `model_config.extra = "ignore"`
- all compatibility fields are optional except `action`
- unknown fields are dropped at parse boundary

This design enables broad inbound compatibility while deferring strict behavior enforcement to adapter/runtime logic.

## Adapter/Runtime Interaction Boundary

Compatibility fields are not uniformly accepted at runtime.

Examples from adapter contracts/tests:

- some compatibility-style fields are explicitly rejected for certain actions (for example snapshot/extract compatibility knobs)
- action payload normalization can map aliases and still reject semantically incompatible combinations

So schema acceptance means "shape is known", not "action will execute".

## Drift and Maintenance Risks

Common drift source:

- updating compatibility action list in schema without updating adapter dispatch, runtime handler map, or parity tests

Recommended discipline:

1. change compatibility literals/aliases in schema
2. update adapter normalization and handler wiring
3. run parity/adapter schema tests
4. update docs with action/field delta

## Related Pages

- [Frontend Sidecar Browser Contracts Docs Hub](README.md)
- [Schema Registry and Action Validation Boundary Reference](schema_registry_and_action_validation_boundary_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](../../../../backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
