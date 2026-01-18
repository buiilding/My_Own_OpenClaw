"""
TTS (Text-to-Speech) Domain.

Contains components for TTS lifecycle management and event processing.
"""
from backend.src.api.tts.manager import TTSManager
from backend.src.api.tts.processor import TTSProcessor

__all__ = [
    "TTSManager",
    "TTSProcessor",
]
