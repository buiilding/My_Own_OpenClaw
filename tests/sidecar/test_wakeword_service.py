from pathlib import Path
from types import SimpleNamespace

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import wakeword_service  # noqa: E402


class _NewApiModel:
    def __init__(self, wakeword_model_paths=None):
        self.wakeword_model_paths = wakeword_model_paths


class _OldApiModel:
    def __init__(self, wakeword_models=None, inference_framework=None):
        if inference_framework == "tflite":
            raise RuntimeError("tflite unavailable")
        self.wakeword_models = wakeword_models
        self.inference_framework = inference_framework


class _PredictModel:
    def predict(self, _audio):
        return {"hey_jarvis": 0.73}


def test_resolve_wakeword_model_prefers_hey_jarvis():
    module = SimpleNamespace(
        models={
            "timer": {"model_path": "/tmp/timer.onnx"},
            "hey_jarvis": {"model_path": "/tmp/hey_jarvis.onnx"},
        }
    )

    model_name, model_path = wakeword_service.resolve_wakeword_model(module)

    assert model_name == "hey_jarvis"
    assert model_path == "/tmp/hey_jarvis.onnx"


def test_resolve_wakeword_model_supports_uppercase_models_map():
    module = SimpleNamespace(
        MODELS={
            "timer": {"model_path": "/tmp/timer.onnx"},
            "hey_jarvis": {"model_path": "/tmp/hey_jarvis.tflite"},
        }
    )

    model_name, model_path = wakeword_service.resolve_wakeword_model(module)

    assert model_name == "hey_jarvis"
    assert model_path == "/tmp/hey_jarvis.tflite"


def test_create_model_supports_new_openwakeword_signature():
    model, inference = wakeword_service.create_model(
        _NewApiModel,
        "hey_jarvis",
        "/tmp/hey_jarvis.onnx",
    )

    assert isinstance(model, _NewApiModel)
    assert model.wakeword_model_paths == ["/tmp/hey_jarvis.onnx"]
    assert inference == "onnx"


def test_create_model_old_signature_falls_back_to_onnx():
    model, inference = wakeword_service.create_model(
        _OldApiModel,
        "hey_jarvis",
        None,
    )

    assert isinstance(model, _OldApiModel)
    assert model.wakeword_models == ["hey_jarvis"]
    assert model.inference_framework == "onnx"
    assert inference == "onnx"


def test_ensure_models_available_returns_true_when_path_exists(tmp_path):
    model_file = tmp_path / "hey_jarvis.onnx"
    model_file.write_bytes(b"ok")

    assert wakeword_service.ensure_models_available("hey_jarvis", str(model_file)) is True


def test_resolve_model_path_from_directory_prefers_known_filename(tmp_path):
    model_dir = tmp_path / "models"
    model_dir.mkdir(parents=True)
    packaged_name = model_dir / "hey_jarvis_v0.1.tflite"
    packaged_name.write_bytes(b"ok")

    resolved = wakeword_service.resolve_model_path_from_directory(
        "hey_jarvis",
        "/opt/WindieOS/resources/openwakeword/resources/models/hey_jarvis_v0.1.tflite",
        model_dir,
    )

    assert resolved == str(packaged_name)


def test_ensure_models_available_downloads_to_target_directory_when_supported(monkeypatch, tmp_path):
    model_dir = tmp_path / "models"
    model_dir.mkdir(parents=True)
    expected_model = model_dir / "hey_jarvis_v0.1.tflite"
    calls = []

    def fake_download(model_names, target_directory=None, **kwargs):
        calls.append((list(model_names), dict(kwargs)))
        if target_directory:
            calls[-1][1]["target_directory"] = target_directory
        expected_model.write_bytes(b"ok")

    monkeypatch.setattr(wakeword_service, "_load_download_models_func", lambda: fake_download)

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
    audio = (b"\x00\x00" * 1600)

    result = wakeword_service.process_audio_chunk(_PredictModel(), audio, "hey_jarvis")

    assert result["detected"] is True
    assert result["model"] == "hey_jarvis"
    assert result["score"] == 0.73
