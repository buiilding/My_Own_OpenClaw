"""Covers config loader behavior in the backend test suite."""

from pathlib import Path
from types import SimpleNamespace

import backend.src.core.config.loader as loader
from backend.src.core.config.loader import (
    get_default_tts_model_path,
    load_api_key_for_provider,
    load_settings_from_file,
)
from backend.src.core.config.models import AppConfig


def _set_disabled_tts_module_state(monkeypatch) -> None:
    import backend.src.core.config.app_config as app_config

    monkeypatch.setattr(
        app_config,
        "APP_CONFIG",
        AppConfig(tts_enabled=False, tts_model_path=None),
    )
    monkeypatch.setattr(loader, "get_default_tts_model_path", lambda: "/tmp/tts.onnx")


def test_load_api_key_for_local_mode(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "should-not-use")
    cfg = AppConfig(model_mode="local", model_provider="openai")
    result = load_api_key_for_provider(cfg)
    assert result.api_key is None


def test_load_api_key_for_unknown_provider():
    cfg = AppConfig(model_provider="unknown-provider")
    result = load_api_key_for_provider(cfg)
    assert result.api_key is None


def test_load_api_key_from_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    cfg = AppConfig(model_provider="openai")
    result = load_api_key_for_provider(cfg)
    assert result.api_key == "test-key"


def test_load_api_key_uses_user_override_when_enabled(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-key")
    cfg = AppConfig(
        model_provider="openai",
        provider_api_keys={
            "openai": {"enabled": True, "api_key": "sk-user-openai"},
        },
    )
    result = load_api_key_for_provider(cfg)
    assert result.api_key == "sk-user-openai"


def test_load_api_key_ignores_stale_provider_oauth_payload(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-key")
    cfg = AppConfig(
        model_provider="openai",
        selected_model_id="gpt-5.3-codex@@gpt-5-3-codex-thinking",
        provider_oauth={
            "openai_codex": {
                "connected": True,
                "access_token": "codex-access-token",
                "expires_at": 4102444800000,
            },
        },
    )
    result = load_api_key_for_provider(cfg)
    assert result.api_key == "env-openai-key"


def test_load_api_key_falls_back_to_env_when_user_override_disabled(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-key")
    cfg = AppConfig(
        model_provider="openai",
        provider_api_keys={
            "openai": {"enabled": False, "api_key": "sk-user-openai"},
        },
    )
    result = load_api_key_for_provider(cfg)
    assert result.api_key == "env-openai-key"


def test_load_api_key_falls_back_to_env_for_redacted_enabled_override(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-key")
    cfg = AppConfig(
        model_provider="openai",
        provider_api_keys={
            "openai": {"enabled": True, "api_key": ""},
        },
    )
    result = load_api_key_for_provider(cfg)
    assert result.api_key == "env-openai-key"


def test_load_api_key_google_override_applies_to_gemini_provider(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "env-google-key")
    cfg = AppConfig(
        model_provider="gemini",
        provider_api_keys={
            "google": {"enabled": True, "api_key": "sk-user-google"},
        },
    )
    result = load_api_key_for_provider(cfg)
    assert result.api_key == "sk-user-google"


def test_load_api_key_for_kimi_uses_only_configured_env(monkeypatch):
    monkeypatch.delenv("KIMI_API_KEY", raising=False)
    monkeypatch.setenv("KIMICODE_API_KEY", "legacy-key")
    cfg = AppConfig(model_provider="kimi_coding")
    result = load_api_key_for_provider(cfg)
    assert result.api_key is None


def test_load_settings_forces_tts_enabled(monkeypatch):
    _set_disabled_tts_module_state(monkeypatch)

    cfg = load_settings_from_file()
    assert cfg.tts_enabled is True
    assert cfg.tts_model_path == "/tmp/tts.onnx"


def test_load_settings_keeps_default_elevenlabs_speech_provider(monkeypatch):
    _set_disabled_tts_module_state(monkeypatch)

    cfg = load_settings_from_file()

    assert cfg.speech_provider == "elevenlabs"


def test_get_default_tts_model_path_windows_uses_appdata(monkeypatch):
    monkeypatch.setattr(
        loader,
        "os",
        SimpleNamespace(
            name="nt",
            getenv=lambda key: (
                "C:/Users/test/AppData/Roaming" if key == "APPDATA" else None
            ),
        ),
    )

    path = get_default_tts_model_path()

    assert "windieos/tts_models/piper" in path
    assert path.endswith("en_GB-jenny_dioco-medium.onnx")
    assert "AppData/Roaming" in path


def test_get_default_tts_model_path_windows_without_appdata_falls_back(monkeypatch):
    monkeypatch.setattr(
        loader,
        "os",
        SimpleNamespace(name="nt", getenv=lambda _key: None),
    )
    monkeypatch.setattr(loader.Path, "home", lambda: Path("/home/test"))

    path = get_default_tts_model_path()

    assert path == (
        "/home/test/.config/windieos/tts_models/piper/"
        "en_GB-jenny_dioco-medium.onnx"
    )


def test_get_default_tts_model_path_macos(monkeypatch):
    monkeypatch.setattr(
        loader,
        "os",
        SimpleNamespace(name="posix", getenv=lambda _key: None),
    )
    monkeypatch.setattr(loader.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(loader.Path, "home", lambda: Path("/Users/test"))

    path = get_default_tts_model_path()

    assert path == (
        "/Users/test/Library/Application Support/windieos/tts_models/piper/"
        "en_GB-jenny_dioco-medium.onnx"
    )


def test_load_api_key_for_provider_with_no_env_var_config(
    monkeypatch,
):
    cfg = AppConfig(model_provider="openai")
    monkeypatch.setattr(
        type(cfg.llm_providers),
        "get_provider_config",
        lambda _self, _provider: SimpleNamespace(api_key_env=None),
    )

    result = load_api_key_for_provider(cfg)

    assert result.api_key is None


def test_load_settings_reload_failure_uses_existing_module_state(monkeypatch):
    _set_disabled_tts_module_state(monkeypatch)
    monkeypatch.setattr(
        loader.importlib,
        "reload",
        lambda _module: (_ for _ in ()).throw(RuntimeError("reload failed")),
    )

    cfg = load_settings_from_file(reload_module=True)

    assert cfg.tts_enabled is True
    assert cfg.tts_model_path == "/tmp/tts.onnx"
