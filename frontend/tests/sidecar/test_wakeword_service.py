"""Covers local-runtime wakeword service behavior."""

from pathlib import Path
from types import SimpleNamespace

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import wakeword_service  # noqa: E402


class _NewApiModel:
    def __init__(self, wakeword_model_paths=None):
        self.wakeword_model_paths = wakeword_model_paths


class _ModelNameOnlyModel:
    def __init__(self, wakeword_models=None, inference_framework=None):
        if inference_framework == "tflite":
            raise RuntimeError("tflite unavailable")
        self.wakeword_models = wakeword_models
        self.inference_framework = inference_framework


class _PredictModel:
    def predict(self, _audio):
        return {"hey_jarvis": 0.73}


class _VariadicPathModel:
    def __init__(self, *args, **kwargs):
        if kwargs.get("inference_framework") == "tflite":
            raise RuntimeError("tflite unavailable")
        self.kwargs = kwargs


class _UnsupportedModel:
    def __init__(self, sample_rate):
        self.sample_rate = sample_rate


def test_resolve_wakeword_name_prefers_agent_env(monkeypatch):
    monkeypatch.setenv(wakeword_service.ENV_WINDIE_WAKEWORD_NAME, "hey_jarvis")
    monkeypatch.setenv(wakeword_service.ENV_AGENT_WAKEWORD_NAME, "custom_agent")

    assert wakeword_service.resolve_wakeword_name() == "custom_agent"


def test_resolve_wakeword_name_supports_windie_legacy_env(monkeypatch):
    monkeypatch.delenv(wakeword_service.ENV_AGENT_WAKEWORD_NAME, raising=False)
    monkeypatch.setenv(wakeword_service.ENV_WINDIE_WAKEWORD_NAME, "hey_jarvis")

    assert wakeword_service.resolve_wakeword_name() == "hey_jarvis"


def test_resolve_wakeword_model_prefers_hey_jarvis(monkeypatch):
    monkeypatch.delenv(wakeword_service.ENV_AGENT_WAKEWORD_NAME, raising=False)
    monkeypatch.delenv(wakeword_service.ENV_WINDIE_WAKEWORD_NAME, raising=False)
    module = SimpleNamespace(
        models={
            "timer": {"model_path": "/tmp/timer.onnx"},
            "hey_jarvis": {"model_path": "/tmp/hey_jarvis.onnx"},
        }
    )

    model_name, model_path = wakeword_service.resolve_wakeword_model(module)

    assert model_name == "hey_jarvis"
    assert model_path == "/tmp/hey_jarvis.onnx"


def test_resolve_wakeword_model_supports_configured_name(monkeypatch):
    monkeypatch.setenv(wakeword_service.ENV_AGENT_WAKEWORD_NAME, "timer")
    module = SimpleNamespace(
        models={
            "timer": {"model_path": "/tmp/timer.onnx"},
            "hey_jarvis": {"model_path": "/tmp/hey_jarvis.onnx"},
        }
    )

    model_name, model_path = wakeword_service.resolve_wakeword_model(module)

    assert model_name == "timer"
    assert model_path == "/tmp/timer.onnx"


def test_resolve_wakeword_model_supports_uppercase_models_map(monkeypatch):
    monkeypatch.delenv(wakeword_service.ENV_AGENT_WAKEWORD_NAME, raising=False)
    monkeypatch.delenv(wakeword_service.ENV_WINDIE_WAKEWORD_NAME, raising=False)
    module = SimpleNamespace(
        MODELS={
            "timer": {"model_path": "/tmp/timer.onnx"},
            "hey_jarvis": {"model_path": "/tmp/hey_jarvis.tflite"},
        }
    )

    model_name, model_path = wakeword_service.resolve_wakeword_model(module)

    assert model_name == "hey_jarvis"
    assert model_path == "/tmp/hey_jarvis.tflite"


def test_resolve_wakeword_model_directory_uses_windieos_root(monkeypatch, tmp_path):
    monkeypatch.delenv(wakeword_service.ENV_AGENT_WAKEWORD_MODEL_DIR, raising=False)
    monkeypatch.delenv(wakeword_service.ENV_WINDIE_WAKEWORD_MODEL_DIR, raising=False)
    monkeypatch.setattr(
        wakeword_service, "app_user_data_root", lambda: tmp_path / "windieos"
    )

    assert (
        wakeword_service.resolve_wakeword_model_directory()
        == tmp_path / "windieos" / "wakeword" / "models"
    )


def test_resolve_wakeword_model_directory_prefers_agent_env(monkeypatch, tmp_path):
    agent_dir = tmp_path / "agent-models"
    legacy_dir = tmp_path / "legacy-models"
    monkeypatch.setenv(wakeword_service.ENV_AGENT_WAKEWORD_MODEL_DIR, str(agent_dir))
    monkeypatch.setenv(wakeword_service.ENV_WINDIE_WAKEWORD_MODEL_DIR, str(legacy_dir))

    assert wakeword_service.resolve_wakeword_model_directory() == agent_dir


def test_resolve_wakeword_model_directory_supports_windie_legacy_env(
    monkeypatch, tmp_path
):
    legacy_dir = tmp_path / "legacy-models"
    monkeypatch.delenv(wakeword_service.ENV_AGENT_WAKEWORD_MODEL_DIR, raising=False)
    monkeypatch.setenv(wakeword_service.ENV_WINDIE_WAKEWORD_MODEL_DIR, str(legacy_dir))

    assert wakeword_service.resolve_wakeword_model_directory() == legacy_dir


def test_resolve_wakeword_allow_runtime_download_prefers_agent_env(monkeypatch):
    monkeypatch.setenv(
        wakeword_service.ENV_WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD,
        "1",
    )
    monkeypatch.setenv(
        wakeword_service.ENV_AGENT_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD,
        "0",
    )

    assert wakeword_service.resolve_wakeword_allow_runtime_download() is False


def test_resolve_wakeword_allow_runtime_download_supports_windie_legacy_env(
    monkeypatch,
):
    monkeypatch.delenv(
        wakeword_service.ENV_AGENT_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD,
        raising=False,
    )
    monkeypatch.setenv(
        wakeword_service.ENV_WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD,
        "0",
    )

    assert wakeword_service.resolve_wakeword_allow_runtime_download() is False


def test_create_model_supports_new_openwakeword_signature():
    model_path = str(Path("/tmp/hey_jarvis.onnx"))
    model, inference = wakeword_service.create_model(
        _NewApiModel,
        model_path,
    )

    assert isinstance(model, _NewApiModel)
    assert model.wakeword_model_paths == [model_path]
    assert inference == "onnx"


def test_create_model_rejects_model_name_only_constructor():
    try:
        wakeword_service.create_model(
            _ModelNameOnlyModel,
            "/tmp/hey_jarvis.onnx",
        )
    except TypeError as exc:
        assert "wakeword_model_paths" in str(exc)
    else:
        raise AssertionError("expected model-name-only wakeword constructor to fail")


def test_create_model_variadic_signature_uses_cached_auxiliary_models_for_onnx_fallback(
    tmp_path,
):
    model_dir = tmp_path / "models"
    model_dir.mkdir(parents=True)
    tflite_model = model_dir / "hey_jarvis_v0.1.tflite"
    onnx_model = model_dir / "hey_jarvis_v0.1.onnx"
    melspec_onnx = model_dir / "melspectrogram.onnx"
    embedding_onnx = model_dir / "embedding_model.onnx"

    for file_path in (
        tflite_model,
        onnx_model,
        model_dir / "melspectrogram.tflite",
        model_dir / "embedding_model.tflite",
        melspec_onnx,
        embedding_onnx,
    ):
        file_path.write_bytes(b"ok")

    model, inference = wakeword_service.create_model(
        _VariadicPathModel,
        str(tflite_model),
    )

    assert inference == "onnx"
    assert model.kwargs["inference_framework"] == "onnx"
    assert model.kwargs["wakeword_model_paths"] == [str(onnx_model)]
    assert "wakeword_models" not in model.kwargs
    assert model.kwargs["melspec_model_path"] == str(melspec_onnx)
    assert model.kwargs["embedding_model_path"] == str(embedding_onnx)


def test_create_model_rejects_unknown_constructor_signature():
    try:
        wakeword_service.create_model(
            _UnsupportedModel,
            None,
        )
    except TypeError as exc:
        assert "wakeword model class must accept" in str(exc)
    else:
        raise AssertionError("expected unsupported wakeword model constructor to fail")


def test_ensure_models_available_returns_true_when_path_exists(tmp_path):
    model_file = tmp_path / "hey_jarvis.onnx"
    model_file.write_bytes(b"ok")

    assert (
        wakeword_service.ensure_models_available("hey_jarvis", str(model_file)) is True
    )


def test_ensure_models_available_missing_packaged_model_uses_generic_reinstall_copy(
    monkeypatch,
):
    statuses = []
    monkeypatch.setattr(
        wakeword_service,
        "_emit_status",
        lambda status, message=None, **extra: statuses.append(
            {"status": status, "message": message, **extra}
        ),
    )

    assert (
        wakeword_service.ensure_models_available(
            "hey_jarvis",
            "/missing/hey_jarvis_v0.1.tflite",
            allow_runtime_download=False,
        )
        is False
    )

    assert statuses[-1]["status"] == "error"
    assert "Reinstall this app" in statuses[-1]["message"]
    assert "Windie" "OS" not in statuses[-1]["message"]


def test_resolve_model_path_from_directory_prefers_known_filename(tmp_path):
    model_dir = tmp_path / "models"
    model_dir.mkdir(parents=True)
    packaged_name = model_dir / "hey_jarvis_v0.1.tflite"
    packaged_name.write_bytes(b"ok")

    resolved = wakeword_service.resolve_model_path_from_directory(
        "hey_jarvis",
        "/opt/agent-runtime/resources/openwakeword/resources/models/hey_jarvis_v0.1.tflite",
        model_dir,
    )

    assert resolved == str(packaged_name)


def test_ensure_models_available_downloads_to_target_directory_when_supported(
    monkeypatch, tmp_path
):
    model_dir = tmp_path / "models"
    model_dir.mkdir(parents=True)
    expected_model = model_dir / "hey_jarvis_v0.1.tflite"
    calls = []

    def fake_download(model_names, target_directory=None, **kwargs):
        calls.append((list(model_names), dict(kwargs)))
        if target_directory:
            calls[-1][1]["target_directory"] = target_directory
        expected_model.write_bytes(b"ok")

    monkeypatch.setattr(
        wakeword_service, "_load_download_models_func", lambda: fake_download
    )

    assert wakeword_service.ensure_models_available(
        "hey_jarvis",
        "/missing/hey_jarvis_v0.1.tflite",
        target_directory=model_dir,
    )
    assert expected_model.exists()
    assert calls
    assert calls[0][0] == ["hey_jarvis"]
    assert calls[0][1]["target_directory"] == str(model_dir)


def test_process_audio_chunk_reports_detection():
    audio = b"\x00\x00" * 1600

    result = wakeword_service.process_audio_chunk(_PredictModel(), audio, "hey_jarvis")

    assert result["detected"] is True
    assert result["model"] == "hey_jarvis"
    assert result["score"] == 0.73
