---
summary: "Backend shared validation reference: query/message/user-id sanitization, client settings patch filtering, and API error-sanitization integration."
read_when:
  - When modifying `core/validation/validators.py` helpers or fields allowed from client settings patches.
  - When debugging why API handlers emit validation errors versus generic internal errors.
title: "Input Validation and Client Settings Patch Guard Reference"
---

# Input Validation and Client Settings Patch Guard Reference

## Canonical Modules

- `backend/src/core/validation/validators.py`
- `backend/src/core/validation/settings_update_rules.py`
- `backend/src/api/schemas/common.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/handlers/settings.py`
- `backend/src/api/infrastructure/errors.py`
- `tests/backend/test_validation_utils.py`
- `tests/backend/test_api_errors.py`

## Validation Layer Roles

The validation layer centralizes:

- shared input type/shape checks
- string sanitization/truncation
- client settings patch allowlist enforcement
- user id restrictions (`default_user` blocked)
- structured `ValidationError` with field-level details

## Core Utility Contracts (`validators.py`)

`validate_message(data, message_type, model_class)`:

- validates payload via Pydantic model
- flattens errors to `field -> message`
- raises custom `ValidationError` with structured `errors` map

`validate_dict(...)`:

- generic dictionary validation helper with optional context suffix in error message

`validate_field(...)`:

- required/optional gating
- type enforcement
- numeric type checks reject `bool` values unless `bool` is explicitly the expected type
- optional custom validator callback

`sanitize_string(value, max_length)`:

- coerces non-string values to string
- strips null bytes
- truncates over max length with warning log

`validate_query_text(text)`:

- requires string
- sanitizes with max length `50000`
- strips and rejects empty/whitespace-only values

`validate_user_id(user_id)`:

- rejects empty/whitespace-only values
- explicitly rejects `"default_user"` to avoid security bypass/invalid session identity

## Client Settings Patch Guard

`ClientSettingsPatch` is the typed client-provided runtime settings model.

Allowed fields (derived from model fields):

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `wakeword_stt_enabled`
- `browser_automation_enabled`
- `include_query_screenshot`
- `provider_api_keys`

Intentionally excluded backend-owned speech/transcription runtime policy:

- `speech_provider`
- `stt_provider`

`validate_client_settings_patch(settings)` behavior:

- non-dict input -> `ValidationError`
- unknown keys are ignored with warning
- validates known keys via `ClientSettingsPatch.model_validate`
- returns only explicitly provided valid keys (`exclude_unset=True`)

Integration:

- `UpdateSettingsHandler` applies only this validated client settings subset to session config updates

## `validate_settings_update` vs `validate_client_settings_patch`

`validate_settings_update(...)`:

- broad AppConfig-key filter based on `AppConfig.model_fields`
- table-driven lightweight type checks for select keys via `settings_update_rules.py`
- unknown fields dropped with warning

`validate_client_settings_patch(...)`:

- strict client settings boundary for websocket settings updates
- primary live path for update-settings handler

## API Schema and Handler Integration

`api/schemas/common.py`:

- `BaseMessage` and `HandshakeMessage` call `validate_user_id` via Pydantic field validators
- message id validator enforces non-empty, max length (`128`), and `[a-zA-Z0-9_-]+` pattern

`api/services/query_execution.py`:

- calls `validate_query_text` before session lookup/execution

`api/handlers/settings.py`:

- `LoadSettingsHandler` returns only client settings patch keys
- `UpdateSettingsHandler` validates patch via `validate_client_settings_patch`

## Error Sanitization Boundary

`api/infrastructure/errors.py` uses validation types to decide exposure:

- custom `ValidationError` message is safe to expose directly
- some keyword-filtered `ValueError`/`KeyError` messages are exposed
- all other exceptions are sanitized to `"An internal error occurred"` (or context-scoped variant)

All helper sends (`send_error_response`, `send_success_response`) use canonical transport envelope shape.

## Test-Backed Invariants

`tests/backend/test_validation_utils.py` verifies:

- validate_message/dict failure surfaces structured field errors/context
- validate_field required/type/custom validator failures
- bool rejection for numeric fields while preserving real boolean fields
- sanitize_string null-byte removal and truncation
- query text stripping/empty rejection
- user-id invalid-value rejection (`default_user`, whitespace)
- settings update filtering/type checks
- settings update rejection of bool values for numeric AppConfig keys
- client settings patch subset enforcement and invalid value rejection

`tests/backend/test_api_errors.py` verifies:

- validation errors remain user-visible
- unsafe internal details are hidden
- success/error sends preserve canonical envelope shape and optional context fields
- closed/runtime websocket send failures are swallowed by send helpers

## Drift Hotspots

1. Expanding client settings patch fields without reviewing ownership boundaries can let clients mutate backend-only config.
2. Relaxing `validate_user_id` can reintroduce shared/default identity collisions across sessions.
3. Bypassing validation helpers in handlers creates inconsistent error shapes and sanitizer bypass risk.
4. Changing sanitization keyword heuristics in `sanitize_error_message` can leak internal details or over-hide useful validation feedback.
