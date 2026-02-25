---
summary: "Deep reference for sidecar BrowserOpenClawCompatArgs action literals, compatibility field families, and schema-vs-runtime enforcement boundaries."
read_when:
  - When changing OpenClaw compatibility action names or payload aliases (`targetId`, `targetUrl`, `inputRef`, etc.).
  - When debugging compatibility payload shape issues across schema acceptance and adapter/runtime execution behavior.
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

- `status`, `profiles`, `done`, `search`, `go_back`, `search_page`, `find_elements`, `find_text`, `input`, `send_keys`, `switch`, `close_tab`, `dropdown_options`, `select_dropdown`, `upload_file`, `write_file`, `replace_file`, `read_file`, `read_long_content`

`OPENCLAW_COMPAT_ACTIONS` is derived from that annotation (`typing.get_args(...)`) and reused in schema-registry wiring.

Scope note:

- removed aliases (`open`, `switch_tab`, `press`, `act`) are intentionally excluded from this compatibility action set.

## Field Families

### Identifier aliases

- tab aliases: `target_id`, `targetId`, `tab_id`
- URL aliases: `url`, `target_url`, `targetUrl`
- input aliases: `input_ref`, `inputRef`

### Search/find payloads

- `query`, `pattern`, `regex`, `case_sensitive`, `context_chars`, `css_scope`, `max_results`, `attributes`, `include_text`

### Snapshot/extract compatibility fields

- `snapshotFormat`
- `mode` compatibility values (`user_chrome`, `managed`, `efficient`, `focused`, `full_text`, `structured`)

### Interaction payloads

- `index`, `text`, `keys`, `code`, `down`, `pages`

### File-operation payloads

- `file_name`, `content`, `append`, `trailing_newline`, `leading_newline`, `old_str`, `new_str`, `path`, `goal`, `source`, `context`

### Session/diagnostic/emulation fields

- timeout/dialog aliases (`timeoutMs`, `timeout_ms`, `promptText`, `prompt_text`)
- storage/network/emulation fields (`cookies`, `kind`, `values`, `headers`, `offline`, geolocation/media/color/timezone/locale/device)

### Legacy passthrough placeholders

Retained compatibility placeholders:

- `profile`, `node`, `target` (`sandbox|host|node`)

## Schema Behavior

- `model_config.extra = "ignore"`
- all fields optional except `action`
- unknown fields dropped at parse boundary

This keeps inbound compatibility broad while runtime enforcement remains adapter-driven.

## Adapter/Runtime Interaction Boundary

Schema acceptance is not execution guarantee.

Examples:

- adapter explicitly rejects selected compatibility fields for snapshot/extract/screenshot/wait paths
- alias policy blocks removed aliases before runtime execution

## Drift Risks and Maintenance Rules

Common drift source:

- updating compatibility action/fields without updating adapter/runtime policy and parity tests

Recommended discipline:

1. update schema literals/fields
2. update browser tool + adapter routing/policy
3. run schema/adapter/parity tests
4. update docs in same change

## Related Pages

- [Frontend Sidecar Browser Contracts Docs Hub](README.md)
- [Schema Registry and Action Validation Boundary Reference](schema_registry_and_action_validation_boundary_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](../../../../backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
