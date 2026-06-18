"""Shared speech-service protocol for runtime-selectable TTS backends."""

from __future__ import annotations

from typing import Any, AsyncGenerator, Dict, Protocol, runtime_checkable


@runtime_checkable
class SpeechService(Protocol):
    """Contract implemented by realtime speech backends."""

    async def initialize(self) -> None:
        """Prepare the speech backend for streaming synthesis."""

    async def shutdown(self) -> None:
        """Tear down any backend resources."""

    async def process_text(self, text_chunk: str) -> None:
        """Accept streamed text for incremental speech generation."""

    async def flush(self) -> None:
        """Force any pending text to be spoken and finalize current output."""

    async def wait_until_finished(self, timeout: float = 10.0) -> bool:
        """Wait for the backend to finish generating audio."""

    async def stream_audio(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Yield normalized audio payloads for client playback."""
