"""
Query Processing Domain.

DEPRECATED: This module is kept for backward compatibility.
New code should import from backend.src.api.processing instead.
"""
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.processing.pipeline import StreamPipeline

__all__ = [
    "ResponseFormatter",
    "StreamPipeline",
]
