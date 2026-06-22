"""Shared protocol for backend-owned transcription provider sessions."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Protocol, runtime_checkable

GatewayEventSender = Callable[[dict[str, Any]], Awaitable[None]]


@runtime_checkable
class TranscriptionProviderSession(Protocol):
    """Provider-specific transcription session hidden behind one local protocol."""

    async def connect(self) -> None:
        """Establish provider-side resources for the active transcription session."""

    async def handle_control_message(self, message: dict[str, Any]) -> None:
        """Handle a client gateway control message such as `set_langs` or `start_over`."""

    async def handle_audio_chunk(self, audio_bytes: bytes, sample_rate: int) -> None:
        """Handle one PCM16 mono audio chunk from the local transcription gateway."""

    async def stream_events(self, send_event: GatewayEventSender) -> None:
        """Forward provider events to the local transcription gateway protocol."""

    async def close(self) -> None:
        """Release provider-side resources."""
