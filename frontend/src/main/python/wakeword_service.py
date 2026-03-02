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

WAKEWORD_NAME = "hey_jarvis"
DETECTION_THRESHOLD = 0.5


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


def resolve_wakeword_model(openwakeword_mod: Any) -> Tuple[str, Optional[str]]:
    models = getattr(openwakeword_mod, "models", None)
    if not isinstance(models, dict) or not models:
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


def ensure_models_available(model_name: str, model_path: Optional[str]) -> bool:
    if model_path and Path(model_path).exists():
        _emit_status("models_ready", f"Wakeword model available: {model_name}")
        return True

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
        download_models([model_name])
    except Exception as exc:
        _emit_status("error", f"Failed to download wakeword models: {exc}")
        return False

    if model_path and not Path(model_path).exists():
        _emit_status("error", f"Wakeword model still missing after download: {model_path}")
        return False

    _emit_status("download_complete", "Wakeword models downloaded successfully")
    return True


def create_model(model_cls: Any, model_name: str, model_path: Optional[str]) -> Tuple[Any, str]:
    init_params = inspect.signature(model_cls.__init__).parameters

    if "wakeword_model_paths" in init_params:
        model_args: Dict[str, Any] = {}
        if model_path:
            model_args["wakeword_model_paths"] = [model_path]
        return model_cls(**model_args), "onnx"

    if "wakeword_models" in init_params:
        model_args = {"wakeword_models": [model_name]}
        if "inference_framework" in init_params:
            try:
                return model_cls(**model_args, inference_framework="tflite"), "tflite"
            except Exception as tflite_error:
                _emit_status(
                    "fallback",
                    f"TFLite failed ({tflite_error}), retrying with ONNX",
                )
                return model_cls(**model_args, inference_framework="onnx"), "onnx"
        return model_cls(**model_args), "onnx"

    # Last-resort compatibility for unrecognized constructor signatures.
    return model_cls(), "unknown"


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
    if not ensure_models_available(model_name, model_path):
        return 1

    try:
        model, inference_type = create_model(model_cls, model_name, model_path)
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
