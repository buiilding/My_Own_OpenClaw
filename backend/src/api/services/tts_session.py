"""Shared TTS lifecycle helper for API handlers/services."""

from __future__ import annotations

import asyncio
from typing import Optional

from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.core.config.models import AppConfig
from backend.src.core.services.speech_service import SpeechService


class _DeferredSpeechService:
    """Speech-service proxy that initializes the real backend on first text input."""

    def __init__(self, tts_manager: TTSManager, config: AppConfig) -> None:
        self._tts_manager = tts_manager
        self._config = config
        self._service: Optional[SpeechService] = None
        self._activation_lock = asyncio.Lock()
        self._activation_event = asyncio.Event()
        self._shutdown_event = asyncio.Event()

    async def _ensure_service(self) -> Optional[SpeechService]:
        service = self._service
        if service is not None:
            return service
        if self._shutdown_event.is_set():
            return None

        async with self._activation_lock:
            if self._service is None and not self._shutdown_event.is_set():
                service = await self._tts_manager.initialize_if_enabled(self._config)
                if self._shutdown_event.is_set():
                    if service is not None:
                        await service.shutdown()
                    self._activation_event.set()
                    return None
                self._service = service
                self._activation_event.set()
            return self._service

    async def initialize(self) -> None:
        """Deferred services initialize on first text chunk."""

    async def shutdown(self) -> None:
        self._shutdown_event.set()
        self._activation_event.set()
        if self._service is not None:
            await self._service.shutdown()

    async def process_text(self, text_chunk: str) -> None:
        service = await self._ensure_service()
        if service is not None:
            await service.process_text(text_chunk)

    async def flush(self) -> None:
        if self._service is not None:
            await self._service.flush()

    async def wait_until_finished(self, timeout: float = 10.0) -> bool:
        if self._service is None:
            return True
        return await self._service.wait_until_finished(timeout=timeout)

    async def stream_audio(self):
        if self._service is None:
            activation_waiter = asyncio.create_task(self._activation_event.wait())
            shutdown_waiter = asyncio.create_task(self._shutdown_event.wait())
            done, pending = await asyncio.wait(
                {activation_waiter, shutdown_waiter},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            if shutdown_waiter in done and self._service is None:
                return
        if self._service is None:
            return
        async for payload in self._service.stream_audio():
            yield payload


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
        self.service: Optional[SpeechService] = None
        self.audio_task: Optional[asyncio.Task] = None

    async def __aenter__(self) -> "TTSSession":
        speech_mode_enabled = bool(getattr(self._config, "speech_mode_enabled", False))
        speech_provider = (
            str(getattr(self._config, "speech_provider", "") or "").strip().lower()
        )
        if speech_mode_enabled and speech_provider == "elevenlabs":
            self.service = _DeferredSpeechService(self._tts_manager, self._config)
        else:
            self.service = await self._tts_manager.initialize_if_enabled(self._config)
        if self.service is not None:
            self.audio_task = await self._tts_manager.start_streaming_task(
                self.service,
                self._websocket,
                self._msg_id,
            )
        return self

    async def __aexit__(self, _exc_type, _exc, _tb) -> None:
        await self._tts_manager.cleanup(self.service, self.audio_task)

    async def wait_for_audio_completion(self, timeout: float) -> None:
        """Wait for the streaming task to drain already-generated audio chunks."""
        if not self.audio_task or self.audio_task.done():
            return
        await asyncio.wait_for(self.audio_task, timeout=timeout)
