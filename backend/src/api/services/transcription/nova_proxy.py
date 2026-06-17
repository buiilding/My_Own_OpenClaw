"""Proxy provider that forwards the local gateway protocol to Nova-Voice."""

from __future__ import annotations

import json
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

from backend.src.api.services.transcription.audio_frames import build_gateway_audio_frame
from backend.src.api.services.transcription.protocol import (
    GatewayEventSender,
    TranscriptionProviderSession,
)
from backend.src.core.config.models import AppConfig


class NovaProxyTranscriptionSession(TranscriptionProviderSession):
    """Thin proxy to an external Nova-Voice gateway."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._connection: Any | None = None

    async def connect(self) -> None:
        self._connection = await websockets.connect(self._config.nova_voice_gateway_url)

    async def handle_control_message(self, message: dict[str, Any]) -> None:
        connection = self._require_connection()
        await connection.send(json.dumps(message))

    async def handle_audio_chunk(self, audio_bytes: bytes, sample_rate: int) -> None:
        connection = self._require_connection()
        await connection.send(build_gateway_audio_frame(audio_bytes, sample_rate))

    async def stream_events(self, send_event: GatewayEventSender) -> None:
        connection = self._require_connection()
        try:
            async for raw_message in connection:
                event = _parse_provider_event(raw_message)
                if event is not None:
                    await send_event(event)
        except ConnectionClosed:
            return

    async def close(self) -> None:
        connection = self._connection
        self._connection = None
        if connection is not None:
            await connection.close()

    def _require_connection(self) -> Any:
        if self._connection is None:
            raise RuntimeError("Nova transcription proxy is not connected")
        return self._connection


def _parse_provider_event(raw_message: str | bytes) -> dict[str, Any] | None:
    if isinstance(raw_message, bytes):
        try:
            raw_message = raw_message.decode("utf-8")
        except UnicodeDecodeError:
            return None

    try:
        payload = json.loads(raw_message)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None
