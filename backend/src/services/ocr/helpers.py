"""Shared helper utilities for OCR service internals."""

from __future__ import annotations

import base64
from typing import Any, List, Optional

CUDA_ERROR_KEYWORDS = (
    "Failed to allocate memory",
    "CUBLAS_STATUS_ALLOC_FAILED",
    "CUBLAS failure",
    "CUDNN",
    "CUDA",
    "cuda_call",
    "cublas",
    "cudnn",
    "CUDNN_STATUS",
    "CUBLAS_STATUS",
    "BFCArena",
    "AllocateRawInternal",
    "RUNTIME_EXCEPTION",
)


def is_cuda_error(error: Exception) -> bool:
    """Return True when an OCR error looks CUDA/ONNX runtime related."""
    error_msg = str(error)
    error_type = type(error).__name__
    if "ONNXRuntimeError" in error_type or "RuntimeException" in error_type:
        return True
    if "ONNXRuntimeError" in error_msg:
        return True
    return any(keyword in error_msg for keyword in CUDA_ERROR_KEYWORDS)


def decode_screenshot_payload(screenshot_b64: str, logger) -> Optional[bytes]:
    """Decode plain base64 or data-URL screenshot payloads."""
    if not isinstance(screenshot_b64, str):
        logger.error("Screenshot payload must be a base64 string")
        return None

    payload = screenshot_b64.strip()
    if not payload:
        logger.error("Screenshot payload is empty")
        return None

    if payload.startswith("data:"):
        _, separator, encoded = payload.partition(",")
        if not separator:
            logger.error("Invalid data URL format for screenshot payload")
            return None
        payload = encoded

    payload = "".join(payload.split())
    try:
        return base64.b64decode(payload, validate=True)
    except Exception as exc:
        logger.error(f"Failed to decode screenshot base64: {exc}")
        return None


def normalize_ocr_field(
    value: Any, *, numpy_available: bool, numpy_module: Any
) -> List[Any]:
    """Normalize mixed OCR SDK field payloads into python lists."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if numpy_available and isinstance(value, numpy_module.ndarray):
        return value.tolist()
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]
