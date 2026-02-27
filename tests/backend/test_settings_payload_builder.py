from __future__ import annotations

from types import SimpleNamespace

from backend.src.api.handlers.settings import _build_frontend_settings_payload


class _DumpableValue:
    def __init__(self, payload):
        self.payload = payload

    def model_dump(self):
        return self.payload


def test_build_frontend_settings_payload_returns_empty_for_none() -> None:
    assert _build_frontend_settings_payload(None) == {}


def test_build_frontend_settings_payload_includes_only_frontend_owned_fields() -> None:
    config = SimpleNamespace(
        model_provider="openai",
        selected_model_id="gpt-5.1",
        provider_api_keys=_DumpableValue({"openai": {"enabled": True, "api_key": "sk"}}),
        interaction_mode="chat",
        unrelated_internal_field="ignore-me",
    )

    payload = _build_frontend_settings_payload(config)

    assert payload == {
        "interaction_mode": "chat",
        "model_provider": "openai",
        "provider_api_keys": {"openai": {"enabled": True, "api_key": "sk"}},
        "selected_model_id": "gpt-5.1",
    }
    assert "unrelated_internal_field" not in payload


def test_build_frontend_settings_payload_is_stably_sorted_by_key() -> None:
    config = SimpleNamespace(
        wakeword_stt_enabled=True,
        model_mode="online",
        include_query_screenshot=False,
        model_provider="openai",
    )

    payload = _build_frontend_settings_payload(config)

    assert list(payload.keys()) == sorted(payload.keys())
