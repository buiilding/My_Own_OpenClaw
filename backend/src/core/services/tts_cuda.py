"""
TTS CUDA fallback helpers.
"""

from __future__ import annotations

from typing import Optional

CUDA_ERROR_KEYWORDS = (
    "Failed to allocate memory",
    "RUNTIME_EXCEPTION",
    "CUBLAS_STATUS_ALLOC_FAILED",
    "CUBLAS failure",
    "CUDNN",
    "CUDA",
    "cuda_call",
    "cublas",
    "cudnn",
    "CUDNN_STATUS",
    "CUBLAS_STATUS",
)


def is_cuda_error(error: Exception) -> bool:
    """
    Detect CUDA/CUDNN/ONNXRuntime GPU-related failures.
    """
    error_msg = str(error)
    error_type = type(error).__name__
    return (
        "ONNXRuntimeError" in error_type
        or "ONNXRuntimeError" in error_msg
        or any(keyword in error_msg for keyword in CUDA_ERROR_KEYWORDS)
    )


def format_truncated_error(error: Exception, limit: int = 200) -> str:
    """
    Format exception text for concise structured logs.
    """
    message = str(error)
    if len(message) <= limit:
        return message
    return message[:limit]
