from backend.src.core.config.loader import load_api_key_for_provider, load_settings_from_file
from backend.src.core.config.models import AppConfig


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


def test_load_api_key_kimi_fallback(monkeypatch):
    monkeypatch.delenv("KIMI_API_KEY", raising=False)
    monkeypatch.setenv("KIMICODE_API_KEY", "fallback-key")
    cfg = AppConfig(model_provider="kimi_coding")
    result = load_api_key_for_provider(cfg)
    assert result.api_key == "fallback-key"


def test_load_settings_forces_tts_enabled(monkeypatch):
    from backend.src.core.config import app_config
    from backend.src.core.config import loader

    monkeypatch.setattr(
        app_config,
        "APP_CONFIG",
        AppConfig(tts_enabled=False, tts_model_path=None),
    )
    monkeypatch.setattr(loader, "get_default_tts_model_path", lambda: "/tmp/tts.onnx")

    cfg = load_settings_from_file()
    assert cfg.tts_enabled is True
    assert cfg.tts_model_path == "/tmp/tts.onnx"
