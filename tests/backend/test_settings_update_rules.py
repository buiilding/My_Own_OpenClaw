"""Covers settings update rules behavior in the backend test suite."""

from backend.src.core.validation.settings_update_rules import (
    SETTINGS_UPDATE_RULES,
    validate_settings_update_field,
)


def test_validate_settings_update_field_ignores_unknown_key() -> None:
    calls: list[tuple[object, ...]] = []

    def _validate_field(*args, **kwargs):
        calls.append((*args, kwargs))

    validate_settings_update_field(
        key="not_a_known_field",
        value="anything",
        validate_field=_validate_field,
    )

    assert calls == []


def test_validate_settings_update_field_allows_none_for_nullable_rules() -> None:
    assert SETTINGS_UPDATE_RULES["history_compaction_trigger_tokens"].allow_none is True
    calls: list[tuple[object, ...]] = []

    def _validate_field(*args, **kwargs):
        calls.append((*args, kwargs))

    validate_settings_update_field(
        key="history_compaction_trigger_tokens",
        value=None,
        validate_field=_validate_field,
    )

    assert calls == []


def test_validate_settings_update_field_validates_expected_type() -> None:
    calls: list[tuple[object, ...]] = []

    def _validate_field(*args, **kwargs):
        calls.append((*args, kwargs))

    validate_settings_update_field(
        key="browser_automation_enabled",
        value=True,
        validate_field=_validate_field,
    )

    assert len(calls) == 1
    args, kwargs = calls[0][:-1], calls[0][-1]
    assert args == (True, "browser_automation_enabled", bool)
    assert kwargs == {"required": False}
