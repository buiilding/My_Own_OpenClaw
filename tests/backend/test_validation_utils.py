"""Covers validation utils behavior in the backend test suite."""

import pytest
from pydantic import BaseModel

from backend.src.core.validation.validators import (
    ValidationError,
    sanitize_string,
    validate_dict,
    validate_field,
    validate_client_settings_patch,
    validate_message,
    validate_query_text,
    validate_settings_update,
    validate_user_id,
)


class SimpleModel(BaseModel):
    name: str
    count: int


def test_validate_message_success():
    model = validate_message({"name": "demo", "count": 2}, "simple", SimpleModel)
    assert model.name == "demo"
    assert model.count == 2


def test_validate_message_failure_includes_field_errors():
    with pytest.raises(ValidationError) as exc:
        validate_message({"name": "demo"}, "simple", SimpleModel)
    assert "count" in exc.value.errors


def test_validate_dict_failure_includes_context():
    with pytest.raises(ValidationError) as exc:
        validate_dict({"name": "demo", "count": "nope"}, SimpleModel, context="demo")
    assert "demo" in exc.value.message


def test_validate_field_required_and_optional():
    with pytest.raises(ValidationError):
        validate_field(None, "required_field", str)
    assert validate_field(None, "optional_field", str, required=False) is None


def test_validate_field_type_and_custom_validator():
    with pytest.raises(ValidationError):
        validate_field("not-int", "count", int)

    def must_be_positive(value):
        if value <= 0:
            raise ValueError("must be positive")
        return value

    with pytest.raises(ValidationError):
        validate_field(0, "count", int, validator=must_be_positive)


def test_validate_field_formats_tuple_expected_types():
    with pytest.raises(ValidationError) as exc:
        validate_field("bad", "llm_timeout", (int, float))

    assert "int or float" in exc.value.message
    assert "got str" in exc.value.message


def test_validate_field_rejects_bool_for_numeric_types():
    with pytest.raises(ValidationError) as int_exc:
        validate_field(True, "count", int)
    assert "got bool" in int_exc.value.message

    with pytest.raises(ValidationError) as float_exc:
        validate_field(False, "llm_timeout", (int, float))
    assert "got bool" in float_exc.value.message

    assert validate_field(True, "enabled", bool) is True
    assert validate_field(1, "count", int) == 1
    assert validate_field(1.5, "timeout", (int, float)) == 1.5


def test_sanitize_string_removes_null_bytes_and_truncates():
    sanitized = sanitize_string("a\x00b", max_length=1)
    assert sanitized == "a"


def test_validate_query_text_strips_and_rejects_empty():
    assert validate_query_text("  hello  ") == "hello"
    with pytest.raises(ValidationError):
        validate_query_text("   ")
    with pytest.raises(ValidationError):
        validate_query_text(123)  # type: ignore[arg-type]


def test_validate_user_id_rejects_invalid_values():
    with pytest.raises(ValidationError):
        validate_user_id("default_user")
    with pytest.raises(ValidationError):
        validate_user_id("   ")
    assert validate_user_id("  alice ") == "alice"


def test_validate_settings_update_filters_unknown_and_validates_types():
    payload = {
        "llm_timeout": 1.5,
        "memory_enabled": True,
        "model_provider": "openai",
        "history_compaction_enabled": True,
        "history_compaction_trigger_tokens": 99999,
        "history_compaction_strategy": "inline",
        "history_compaction_openai_remote_enabled": True,
        "unknown_field": "drop-me",
    }
    validated = validate_settings_update(payload)
    assert "unknown_field" not in validated
    assert "history_compaction_strategy" not in validated
    assert "history_compaction_openai_remote_enabled" not in validated
    assert validated["llm_timeout"] == 1.5
    assert validated["memory_enabled"] is True
    assert validated["history_compaction_enabled"] is True
    assert validated["history_compaction_trigger_tokens"] == 99999


def test_validate_settings_update_allows_null_compaction_trigger_tokens():
    validated = validate_settings_update({"history_compaction_trigger_tokens": None})
    assert "history_compaction_trigger_tokens" in validated
    assert validated["history_compaction_trigger_tokens"] is None


def test_validate_settings_update_rejects_bad_types():
    with pytest.raises(ValidationError):
        validate_settings_update({"model_provider": 123})
    with pytest.raises(ValidationError):
        validate_settings_update({"history_compaction_enabled": "yes"})
    with pytest.raises(ValidationError) as exc:
        validate_settings_update({"llm_timeout": "bad"})
    assert "int or float" in exc.value.message


def test_validate_settings_update_rejects_booleans_for_numeric_settings():
    with pytest.raises(ValidationError) as int_exc:
        validate_settings_update({"history_compaction_trigger_tokens": True})
    assert "got bool" in int_exc.value.message

    with pytest.raises(ValidationError) as float_exc:
        validate_settings_update({"llm_timeout": False})
    assert "got bool" in float_exc.value.message

    assert (
        validate_settings_update({"history_compaction_trigger_tokens": 4096})[
            "history_compaction_trigger_tokens"
        ]
        == 4096
    )
    assert validate_settings_update({"llm_timeout": 1.5})["llm_timeout"] == 1.5
    assert (
        validate_settings_update({"memory_enabled": False})["memory_enabled"] is False
    )


def test_validate_client_settings_patch_allows_subset_and_validates_values():
    assert validate_client_settings_patch(None) == {}

    with pytest.raises(ValidationError):
        validate_client_settings_patch(["not", "a", "dict"])  # type: ignore[arg-type]

    payload = {
        "model_mode": "online",
        "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
        "wakeword_stt_enabled": True,
        "browser_automation_enabled": False,
        "include_query_screenshot": True,
        "provider_api_keys": {
            "openai": {"enabled": True, "api_key": "sk-openai"},
        },
        "provider_oauth": {
            "openai_codex": {
                "connected": True,
                "access_token": "codex-access",
                "refresh_token": "codex-refresh",
                "expires_at": 4102444800000,
                "profile_id": "openai-codex:default",
            },
        },
        "not_allowed": "ignored",
    }
    validated = validate_client_settings_patch(payload)
    assert "not_allowed" not in validated
    assert validated["model_mode"] == "online"
    assert validated["wakeword_stt_enabled"] is True
    assert validated["browser_automation_enabled"] is False
    assert validated["include_query_screenshot"] is True
    assert validated["provider_api_keys"]["openai"]["enabled"] is True
    assert "provider_oauth" not in validated

    with pytest.raises(ValidationError):
        validate_client_settings_patch({"model_mode": "invalid"})


def test_validate_client_settings_patch_drops_blank_model_fields() -> None:
    validated = validate_client_settings_patch(
        {
            "model_provider": "   ",
            "selected_model_id": "",
        }
    )
    assert "model_provider" not in validated
    assert "selected_model_id" not in validated


def test_validate_client_settings_patch_trims_model_fields() -> None:
    validated = validate_client_settings_patch(
        {
            "model_provider": " gemini ",
            "selected_model_id": " gemini-3-flash-preview@@gemini-3-flash-thinking ",
        }
    )
    assert validated["model_provider"] == "gemini"
    assert (
        validated["selected_model_id"]
        == "gemini-3-flash-preview@@gemini-3-flash-thinking"
    )


def test_validate_client_settings_patch_ignores_backend_owned_speech_provider() -> None:
    validated = validate_client_settings_patch(
        {
            "speech_provider": "local",
            "speech_mode_enabled": True,
        }
    )

    assert validated == {"speech_mode_enabled": True}
