"""Validation rules for settings update payload fields."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class SettingsUpdateRule:
    """Type and nullability contract for one settings key."""

    expected_types: tuple[type, ...]
    allow_none: bool = False


SETTINGS_UPDATE_RULES: dict[str, SettingsUpdateRule] = {
    "llm_timeout": SettingsUpdateRule((int, float)),
    "query_timeout": SettingsUpdateRule((int, float)),
    "memory_enabled": SettingsUpdateRule((bool,)),
    "model_provider": SettingsUpdateRule((str,), allow_none=True),
    "selected_model_id": SettingsUpdateRule((str,), allow_none=True),
    "model_mode": SettingsUpdateRule((str,), allow_none=True),
    "embedding_model": SettingsUpdateRule((str,), allow_none=True),
    "interaction_mode": SettingsUpdateRule((str,), allow_none=True),
    "browser_automation_enabled": SettingsUpdateRule((bool,)),
    "history_compaction_enabled": SettingsUpdateRule((bool,)),
    "history_compaction_manual_enabled": SettingsUpdateRule((bool,)),
    "history_compaction_openai_remote_enabled": SettingsUpdateRule((bool,)),
    "history_compaction_trigger_tokens": SettingsUpdateRule((int,), allow_none=True),
    "history_compaction_target_tokens": SettingsUpdateRule((int,), allow_none=True),
    "history_compaction_keep_recent_user_messages": SettingsUpdateRule(
        (int,), allow_none=True
    ),
    "history_compaction_summary_max_tokens": SettingsUpdateRule((int,), allow_none=True),
    "history_compaction_cooldown_turns": SettingsUpdateRule((int,), allow_none=True),
    "history_compaction_strategy": SettingsUpdateRule((str,)),
    "history_compaction_prompt": SettingsUpdateRule((str,), allow_none=True),
}


def validate_settings_update_field(
    *,
    key: str,
    value: Any,
    validate_field: Callable[..., Any],
) -> None:
    """
    Run shared type validation for one settings key when a rule exists.

    Keys not in SETTINGS_UPDATE_RULES are intentionally ignored here and left
    for downstream AppConfig validation.
    """

    rule = SETTINGS_UPDATE_RULES.get(key)
    if not rule:
        return
    if value is None and rule.allow_none:
        return
    expected_type: type | tuple[type, ...]
    if len(rule.expected_types) == 1:
        expected_type = rule.expected_types[0]
    else:
        expected_type = rule.expected_types
    validate_field(value, key, expected_type, required=False)
