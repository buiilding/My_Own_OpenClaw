"""
TTS Processing.

Text-to-speech management and processing.
"""
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.processing.tts.processor import TTSProcessor

__all__ = [
    "TTSManager",
    "TTSProcessor",
]
