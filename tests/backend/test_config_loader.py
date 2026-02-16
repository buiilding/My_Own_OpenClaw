from pathlib import Path
from types import SimpleNamespace

import backend.src.core.config.loader as loader
from backend.src.core.config.loader import (
    get_default_tts_model_path,
    load_api_key_for_provider,
    load_settings_from_file,
)
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

    monkeypatch.setattr(
        app_config,
        "APP_CONFIG",
        AppConfig(tts_enabled=False, tts_model_path=None),
    )
    monkeypatch.setattr(loader, "get_default_tts_model_path", lambda: "/tmp/tts.onnx")

    cfg = load_settings_from_file()
    assert cfg.tts_enabled is True
    assert cfg.tts_model_path == "/tmp/tts.onnx"


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

    assert "DesktopAssistant/tts_models/piper" in path
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
        "/home/test/.config/DesktopAssistant/tts_models/piper/"
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
        "/Users/test/Library/Application Support/DesktopAssistant/tts_models/piper/"
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
    from backend.src.core.config import app_config

    monkeypatch.setattr(
        app_config,
        "APP_CONFIG",
        AppConfig(tts_enabled=False, tts_model_path=None),
    )
    monkeypatch.setattr(loader, "get_default_tts_model_path", lambda: "/tmp/tts.onnx")
    monkeypatch.setattr(
        loader.importlib,
        "reload",
        lambda _module: (_ for _ in ()).throw(RuntimeError("reload failed")),
    )

    cfg = load_settings_from_file(reload_module=True)

    assert cfg.tts_enabled is True
    assert cfg.tts_model_path == "/tmp/tts.onnx"
