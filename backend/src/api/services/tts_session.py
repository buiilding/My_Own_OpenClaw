"""Shared TTS lifecycle helper for API handlers/services."""

from __future__ import annotations

import asyncio
from typing import Optional

from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.core.config import AppConfig
from backend.src.core.services.tts_service import TTSService


class TTSSession:
    """Async context manager for per-request TTS setup/cleanup."""

    def __init__(
        self,
        tts_manager: TTSManager,
        config: AppConfig,
        websocket: WebSocketSender,
        msg_id: str,
    ) -> None:
        self._tts_manager = tts_manager
        self._config = config
        self._websocket = websocket
        self._msg_id = msg_id
        self.service: Optional[TTSService] = None
        self.audio_task: Optional[asyncio.Task] = None

    async def __aenter__(self) -> "TTSSession":
        self.service = await self._tts_manager.initialize_if_enabled(self._config)
        if self.service is not None:
            self.audio_task = await self._tts_manager.start_streaming_task(
                self.service,
                self._websocket,
                self._msg_id,
            )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self.audio_task and not self.audio_task.done():
            self.audio_task.cancel()
        await self._tts_manager.cleanup(self.service, self.audio_task)

    async def wait_for_audio_completion(self, timeout: float) -> None:
        """Wait for the streaming task to drain already-generated audio chunks."""
        if not self.audio_task or self.audio_task.done():
            return
        await asyncio.wait_for(self.audio_task, timeout=timeout)
