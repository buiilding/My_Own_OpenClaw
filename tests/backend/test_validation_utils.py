import pytest
from pydantic import BaseModel

from backend.src.core.validation.validators import (
    ValidationError,
    sanitize_string,
    validate_dict,
    validate_field,
    validate_frontend_config,
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
        "max_history_length": 25,
        "llm_timeout": 1.5,
        "memory_enabled": True,
        "model_provider": "openai",
        "unknown_field": "drop-me",
    }
    validated = validate_settings_update(payload)
    assert "unknown_field" not in validated
    assert validated["max_history_length"] == 25
    assert validated["llm_timeout"] == 1.5
    assert validated["memory_enabled"] is True


def test_validate_settings_update_rejects_bad_types():
    with pytest.raises(ValidationError):
        validate_settings_update({"max_history_length": "nope"})
    with pytest.raises(ValidationError):
        validate_settings_update({"model_provider": 123})


def test_validate_frontend_config_allows_subset_and_validates_values():
    assert validate_frontend_config(None) == {}

    with pytest.raises(ValidationError):
        validate_frontend_config(["not", "a", "dict"])  # type: ignore[arg-type]

    payload = {
        "model_mode": "online",
        "selected_model_id": "gpt-5.1",
        "voice_mode_enabled": False,
        "wakeword_stt_enabled": True,
        "agent_full_sudo_enabled": True,
        "include_query_screenshot": True,
        "not_allowed": "ignored",
    }
    validated = validate_frontend_config(payload)
    assert "not_allowed" not in validated
    assert validated["model_mode"] == "online"
    assert validated["wakeword_stt_enabled"] is True
    assert validated["agent_full_sudo_enabled"] is True
    assert validated["include_query_screenshot"] is True

    with pytest.raises(ValidationError):
        validate_frontend_config({"model_mode": "invalid"})
