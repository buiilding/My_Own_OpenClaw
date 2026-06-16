#!/usr/bin/env python3
"""
Wakeword Detection Service for Electron App.

Runs as a subprocess, receives PCM audio chunks over stdin, and returns
length-prefixed JSON detection payloads over stdout.
"""

from __future__ import annotations

import importlib
import inspect
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Optional, Tuple

import numpy as np

from core.env_flags import env_flag_enabled
from core.user_data_paths import windie_user_data_root

WAKEWORD_NAME = "hey_jarvis"
DETECTION_THRESHOLD = 0.5
ENV_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD = "WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD"


def _emit_status(status: str, message: str | None = None, **extra: Any) -> None:
    payload: Dict[str, Any] = {"status": status}
    if message is not None:
        payload["message"] = message
    payload.update(extra)
    print(json.dumps(payload), file=sys.stderr, flush=True)


def _read_exact(reader, length: int) -> bytes:
    data = bytearray()
    while len(data) < length:
        chunk = reader.read(length - len(data))
        if not chunk:
            break
        data.extend(chunk)
    return bytes(data)


def _send_result(writer, payload: Dict[str, Any]) -> None:
    encoded = json.dumps(payload).encode("utf-8")
    writer.write(len(encoded).to_bytes(4, byteorder="little"))
    writer.write(encoded)
    writer.flush()


def _load_download_models_func() -> Optional[Callable[[Iterable[str]], Any]]:
    try:
        utils_mod = importlib.import_module("openwakeword.utils")
    except Exception:
        return None
    candidate = getattr(utils_mod, "download_models", None)
    return candidate if callable(candidate) else None


def _resolve_openwakeword_models(openwakeword_mod: Any) -> Dict[str, Dict[str, Any]]:
    for attr_name in ("models", "MODELS"):
        models = getattr(openwakeword_mod, attr_name, None)
        if isinstance(models, dict) and models:
            return models
    return {}


def resolve_wakeword_model(openwakeword_mod: Any) -> Tuple[str, Optional[str]]:
    models = _resolve_openwakeword_models(openwakeword_mod)
    if not models:
        return WAKEWORD_NAME, None

    if WAKEWORD_NAME in models and isinstance(models[WAKEWORD_NAME], dict):
        preferred_path = models[WAKEWORD_NAME].get("model_path")
        return WAKEWORD_NAME, str(preferred_path) if preferred_path else None

    for model_name, model_meta in models.items():
        if not isinstance(model_meta, dict):
            continue
        model_path = model_meta.get("model_path")
        if model_path:
            return str(model_name), str(model_path)

    return WAKEWORD_NAME, None


def resolve_wakeword_model_directory() -> Path:
    env_dir = os.environ.get("WINDIE_WAKEWORD_MODEL_DIR", "").strip()
    if env_dir:
        return Path(env_dir).expanduser()
    return windie_user_data_root() / "wakeword" / "models"


def resolve_model_path_from_directory(
    model_name: str,
    model_path: Optional[str],
    model_directory: Optional[Path],
) -> Optional[str]:
    if model_directory is None:
        return None
    directory = Path(model_directory).expanduser()
    if not directory.exists():
        return None

    candidates: list[Path] = []
    if model_path:
        candidates.append(directory / Path(model_path).name)

    model_slug = model_name.strip()
    if model_slug:
        candidates.extend(
            [
                directory / f"{model_slug}.tflite",
                directory / f"{model_slug}.onnx",
                directory / f"{model_slug}_v0.1.tflite",
                directory / f"{model_slug}_v0.1.onnx",
            ]
        )
        for pattern in (
            f"{model_slug}*.tflite",
            f"{model_slug}*.onnx",
            f"*{model_slug}*.tflite",
            f"*{model_slug}*.onnx",
        ):
            candidates.extend(sorted(directory.glob(pattern)))

    seen: set[str] = set()
    for candidate in candidates:
        candidate_str = str(candidate)
        if candidate_str in seen:
            continue
        seen.add(candidate_str)
        if candidate.exists():
            return str(candidate)
    return None


def ensure_models_available(
    model_name: str,
    model_path: Optional[str],
    target_directory: Optional[Path] = None,
    allow_runtime_download: bool = True,
) -> bool:
    if model_path and Path(model_path).exists():
        _emit_status("models_ready", f"Wakeword model available: {model_name}", model_path=model_path)
        return True
    resolved_downloaded_path = resolve_model_path_from_directory(model_name, model_path, target_directory)
    if resolved_downloaded_path:
        _emit_status(
            "models_ready",
            f"Wakeword model available: {model_name}",
            model_path=resolved_downloaded_path,
        )
        return True

    if not allow_runtime_download:
        missing = model_path or f"model for '{model_name}'"
        _emit_status(
            "error",
            (
                "Wakeword model is missing from bundled runtime and runtime downloads are disabled. "
                f"Missing: {missing}. Reinstall WindieOS."
            ),
        )
        return False

    download_models = _load_download_models_func()
    if download_models is None:
        missing = model_path or f"model for '{model_name}'"
        _emit_status(
            "error",
            (
                "Wakeword models missing and openwakeword does not expose "
                f"download_models(). Missing: {missing}"
            ),
        )
        return False

    _emit_status("downloading", f"Downloading wakeword model '{model_name}'...")
    try:
        model_directory_str = str(target_directory) if target_directory else None
        init_params = inspect.signature(download_models).parameters
        if model_directory_str and "target_directory" in init_params:
            Path(model_directory_str).mkdir(parents=True, exist_ok=True)
            download_models([model_name], target_directory=model_directory_str)
        else:
            download_models([model_name])
    except Exception as exc:
        _emit_status("error", f"Failed to download wakeword models: {exc}")
        return False

    if resolve_model_path_from_directory(model_name, model_path, target_directory):
        _emit_status("download_complete", "Wakeword models downloaded successfully")
        return True

    if model_path and Path(model_path).exists():
        _emit_status("download_complete", "Wakeword models downloaded successfully")
        return True

    missing_reference = model_path
    if not missing_reference and target_directory:
        missing_reference = str(target_directory)
    if missing_reference:
        _emit_status("error", f"Wakeword model still missing after download: {missing_reference}")
        return False

    _emit_status("download_complete", "Wakeword models downloaded successfully")
    return True


def resolve_model_path_for_framework(model_path: Optional[str], framework: str) -> Optional[str]:
    if not model_path:
        return None

    resolved_path = Path(model_path).expanduser()
    suffix = ".tflite" if framework == "tflite" else ".onnx"
    if resolved_path.suffix == suffix:
        return str(resolved_path)

    sibling_path = resolved_path.with_suffix(suffix)
    if sibling_path.exists():
        return str(sibling_path)
    return str(resolved_path)


def resolve_audio_feature_model_args(
    init_params: Dict[str, inspect.Parameter],
    supports_variadic_kwargs: bool,
    model_path: Optional[str],
    framework: str,
) -> Dict[str, str]:
    if not model_path:
        return {}

    model_directory = Path(model_path).expanduser().parent
    suffix = ".tflite" if framework == "tflite" else ".onnx"
    candidate_paths = {
        "melspec_model_path": model_directory / f"melspectrogram{suffix}",
        "embedding_model_path": model_directory / f"embedding_model{suffix}",
    }

    model_args: Dict[str, str] = {}
    for arg_name, candidate_path in candidate_paths.items():
        if not candidate_path.exists():
            continue
        if arg_name in init_params or supports_variadic_kwargs:
            model_args[arg_name] = str(candidate_path)
    return model_args


def create_model(model_cls: Any, model_path: Optional[str]) -> Tuple[Any, str]:
    init_params = inspect.signature(model_cls.__init__).parameters
    supports_variadic_kwargs = any(
        param.kind == inspect.Parameter.VAR_KEYWORD for param in init_params.values()
    )
    supports_model_paths = "wakeword_model_paths" in init_params or supports_variadic_kwargs
    supports_framework = "inference_framework" in init_params or supports_variadic_kwargs

    if not supports_model_paths:
        raise TypeError(
            "wakeword model class must accept wakeword_model_paths or variadic keyword arguments"
        )
    if not model_path:
        raise ValueError("wakeword model path is required to initialize wakeword_model_paths")

    def _build_model_args(framework: str) -> Dict[str, Any]:
        resolved_model_path = resolve_model_path_for_framework(model_path, framework)
        if not resolved_model_path:
            raise ValueError("wakeword model path is required to initialize wakeword_model_paths")

        model_args: Dict[str, Any] = {"wakeword_model_paths": [resolved_model_path]}
        model_args.update(
            resolve_audio_feature_model_args(
                init_params,
                supports_variadic_kwargs,
                resolved_model_path,
                framework,
            )
        )
        return model_args

    def _build_model_with_framework_fallback() -> Tuple[Any, str]:
        if supports_framework:
            try:
                return model_cls(**_build_model_args("tflite"), inference_framework="tflite"), "tflite"
            except Exception as tflite_error:
                _emit_status(
                    "fallback",
                    f"TFLite failed ({tflite_error}), retrying with ONNX",
                )
                return model_cls(**_build_model_args("onnx"), inference_framework="onnx"), "onnx"
        return model_cls(**_build_model_args("onnx")), "onnx"

    return _build_model_with_framework_fallback()


def extract_detection(predictions: Any, preferred_model: str) -> Tuple[str, float]:
    if isinstance(predictions, tuple) and predictions:
        predictions = predictions[0]

    if not isinstance(predictions, dict) or not predictions:
        return preferred_model, 0.0

    if preferred_model in predictions:
        return preferred_model, float(predictions[preferred_model])

    model_name, score = max(predictions.items(), key=lambda item: float(item[1]))
    return str(model_name), float(score)


def process_audio_chunk(model: Any, audio_data: bytes, preferred_model: str) -> Dict[str, Any]:
    try:
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        if audio_array.size == 0:
            return {"detected": False}

        predictions = model.predict(audio_array)
        model_name, score = extract_detection(predictions, preferred_model)

        if score >= DETECTION_THRESHOLD:
            score_pct = score * 100.0
            print(
                f"[Python] *** DETECTED *** {model_name}: {score:.4f} ({score_pct:.1f}%)",
                file=sys.stderr,
                flush=True,
            )
            return {
                "detected": True,
                "model": model_name,
                "score": score,
                "confidence": score,
            }

        if score > 0.05:
            print(
                f"[Python] {model_name}: {score:.4f} ({score * 100.0:.1f}%)",
                file=sys.stderr,
                flush=True,
            )
        return {"detected": False}
    except Exception as exc:
        _emit_status("error", f"Error processing audio: {exc}")
        return {"error": str(exc)}


def run_service() -> int:
    try:
        openwakeword_mod = importlib.import_module("openwakeword")
        model_module = importlib.import_module("openwakeword.model")
        model_cls = getattr(model_module, "Model")
    except Exception as exc:
        _emit_status("error", f"Failed to import openwakeword: {exc}")
        return 1

    model_name, model_path = resolve_wakeword_model(openwakeword_mod)
    model_directory = resolve_wakeword_model_directory()
    allow_runtime_download = env_flag_enabled(
        ENV_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD,
        default=True,
    )
    if not ensure_models_available(
        model_name,
        model_path,
        target_directory=model_directory,
        allow_runtime_download=allow_runtime_download,
    ):
        return 1
    model_path = (
        model_path
        if model_path and Path(model_path).exists()
        else resolve_model_path_from_directory(model_name, model_path, model_directory)
    )

    try:
        model, inference_type = create_model(model_cls, model_path)
    except Exception as exc:
        _emit_status("error", f"Failed to initialize wakeword model: {exc}")
        return 1

    _emit_status("ready", model=model_name, inference=inference_type)

    reader = sys.stdin.buffer
    writer = sys.stdout.buffer
    while True:
        length_bytes = _read_exact(reader, 4)
        if len(length_bytes) != 4:
            break
        length = int.from_bytes(length_bytes, byteorder="little")

        if length == 0:
            if hasattr(model, "reset") and callable(model.reset):
                try:
                    model.reset()
                except Exception as exc:
                    _emit_status("error", f"Failed to reset wakeword model: {exc}")
            continue

        audio_data = _read_exact(reader, length)
        if len(audio_data) != length:
            break

        result = process_audio_chunk(model, audio_data, model_name)
        _send_result(writer, result)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(run_service())
    except KeyboardInterrupt:
        sys.exit(0)
