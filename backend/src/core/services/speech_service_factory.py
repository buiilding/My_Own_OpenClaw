"""Speech backend factory for runtime provider selection."""

from __future__ import annotations

from backend.src.core.config import AppConfig
from backend.src.core.services.elevenlabs_tts_service import ElevenLabsTTSService
from backend.src.core.services.speech_service import SpeechService
from backend.src.core.services.tts_service import TTSService


def create_speech_service(config: AppConfig) -> SpeechService:
    """Create the configured speech backend instance."""
    if config.speech_provider == "elevenlabs":
        return ElevenLabsTTSService(config)
    return TTSService(config)
