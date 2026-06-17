"""Factory for backend-owned transcription provider sessions."""

from __future__ import annotations

from backend.src.api.services.transcription.nova_proxy import (
    NovaProxyTranscriptionSession,
)
from backend.src.api.services.transcription.openai_realtime import (
    OpenAIRealtimeTranscriptionSession,
)
from backend.src.api.services.transcription.protocol import TranscriptionProviderSession
from backend.src.core.config.models import AppConfig


def create_transcription_provider_session(config: AppConfig) -> TranscriptionProviderSession:
    """Create the configured backend-owned transcription session."""
    if config.stt_provider == "openai":
        return OpenAIRealtimeTranscriptionSession(config)
    return NovaProxyTranscriptionSession(config)
