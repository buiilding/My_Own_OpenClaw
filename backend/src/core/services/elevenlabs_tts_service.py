"""ElevenLabs websocket-backed realtime TTS service."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, AsyncGenerator, Dict, Optional
from urllib.parse import urlencode

from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)

_DEFAULT_SAMPLE_WIDTH = 2
_DEFAULT_CHANNELS = 1


def _import_websockets():
    import websockets

    return websockets


class ElevenLabsTTSService:
    """Realtime TTS backend that streams partial text to ElevenLabs."""

    def __init__(self, config: AppConfig):
        self.config = config
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.running = False
        self.audio_queue: Optional[asyncio.Queue] = None
        self._processing_complete: Optional[asyncio.Event] = None
        self._receiver_task: Optional[asyncio.Task] = None
        self._websocket = None
        self._eos_sent = False
        self._shutdown_requested = False
        self._session_lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Open ElevenLabs websocket session and start audio receive loop."""
        self.loop = asyncio.get_running_loop()
        self.audio_queue = asyncio.Queue()
        self._processing_complete = asyncio.Event()
        self._processing_complete.set()
        self._shutdown_requested = False
        async with self._session_lock:
            await self._open_websocket_session()

    async def _open_websocket_session(self) -> None:
        """Open one ElevenLabs generation websocket for the next text chunks."""
        if self._shutdown_requested or self.running:
            return
        api_key = self._resolve_api_key()
        if not api_key:
            logger.warning(
                "ElevenLabs TTS not initialized: env var '%s' is not set",
                self.config.elevenlabs_api_key_env,
            )
            return
        if not self.config.elevenlabs_voice_id:
            logger.warning("ElevenLabs TTS not initialized: voice id is not configured")
            return

        try:
            await self._close_websocket()
            websockets = _import_websockets()
            self._websocket = await websockets.connect(self._build_uri())
            await self._websocket.send(json.dumps(self._build_initial_message(api_key)))
            self._eos_sent = False
            self.running = True
            self._receiver_task = asyncio.create_task(self._receive_audio_loop())
            logger.info(
                "ElevenLabs TTS initialized (model=%s, voice_id=%s)",
                self.config.elevenlabs_model_id,
                self.config.elevenlabs_voice_id,
            )
        except Exception as exc:
            logger.error("Failed to initialize ElevenLabs TTS: %s", exc, exc_info=True)
            await self._close_websocket()

    async def shutdown(self) -> None:
        """Shut down websocket receive loop and connection."""
        self._shutdown_requested = True
        self.running = False
        if self._receiver_task and not self._receiver_task.done():
            self._receiver_task.cancel()
            try:
                await self._receiver_task
            except asyncio.CancelledError:
                pass
        await self._close_websocket()
        if self.audio_queue is not None:
            await self.audio_queue.put(None)

    async def process_text(self, text_chunk: str) -> None:
        """Stream plain-text chunks to ElevenLabs as soon as they are speakable."""
        if self._shutdown_requested:
            return
        if self._eos_sent and self._processing_complete:
            try:
                await asyncio.wait_for(self._processing_complete.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning(
                    "ElevenLabs timed out waiting for prior generation before reopening"
                )
        if not self.running or self._eos_sent:
            async with self._session_lock:
                if self._eos_sent and self._processing_complete:
                    try:
                        await asyncio.wait_for(
                            self._processing_complete.wait(), timeout=5.0
                        )
                    except asyncio.TimeoutError:
                        logger.warning(
                            "ElevenLabs timed out waiting for prior generation before reopening"
                        )
                if not self.running or self._eos_sent:
                    await self._open_websocket_session()
        if not self.running:
            return
        if self._processing_complete:
            self._processing_complete.clear()
        await self._send_text_chunk(text_chunk, try_trigger_generation=True)

    async def flush(self) -> None:
        """Flush pending text and close the current websocket generation."""
        if not self._processing_complete:
            return
        if self._eos_sent:
            try:
                await asyncio.wait_for(self._processing_complete.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("ElevenLabs flush timeout while waiting for final audio")
            return

        self._processing_complete.clear()
        try:
            if self._websocket is not None:
                await self._websocket.send(json.dumps({"text": "", "flush": True}))
            self._eos_sent = True
            await asyncio.wait_for(self._processing_complete.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning(
                "ElevenLabs flush timeout - final audio may still be in flight"
            )
        except Exception as exc:
            logger.error("ElevenLabs flush failed: %s", exc, exc_info=True)

    async def wait_until_finished(self, timeout: float = 10.0) -> bool:
        """Wait until ElevenLabs sends its terminal message."""
        if not self._processing_complete:
            return True
        try:
            await asyncio.wait_for(self._processing_complete.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            logger.warning("ElevenLabs wait_until_finished timeout after %ss", timeout)
            return False

    async def stream_audio(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Yield normalized audio chunks until the receive loop finishes."""
        if not self.audio_queue:
            return

        while True:
            payload = await self.audio_queue.get()
            self.audio_queue.task_done()
            if payload is None:
                break
            yield payload

    def _build_uri(self) -> str:
        query = urlencode(
            {
                "model_id": self.config.elevenlabs_model_id,
                "output_format": self.config.elevenlabs_output_format,
                "auto_mode": str(self.config.elevenlabs_auto_mode).lower(),
                "inactivity_timeout": self.config.elevenlabs_inactivity_timeout,
            }
        )
        return (
            "wss://api.elevenlabs.io/v1/text-to-speech/"
            f"{self.config.elevenlabs_voice_id}/stream-input?{query}"
        )

    def _build_initial_message(self, api_key: str) -> Dict[str, Any]:
        message: Dict[str, Any] = {
            "text": " ",
            "xi_api_key": api_key,
        }
        if not self.config.elevenlabs_auto_mode:
            message["generation_config"] = {
                "chunk_length_schedule": list(
                    self.config.elevenlabs_chunk_length_schedule
                ),
            }
        return message

    def _resolve_api_key(self) -> str:
        return os.getenv(self.config.elevenlabs_api_key_env, "").strip()

    def _normalize_text_chunk(self, text: str) -> Optional[str]:
        normalized = str(text or "").strip()
        if not normalized:
            return None
        return f"{normalized} "

    def _output_sample_rate(self) -> int:
        format_name = self.config.elevenlabs_output_format
        if format_name.startswith("pcm_"):
            try:
                return int(format_name.split("_", 1)[1])
            except (IndexError, ValueError):
                pass
        return 16000

    async def _send_text_chunk(
        self,
        text: str,
        *,
        try_trigger_generation: bool,
    ) -> None:
        normalized_text = self._normalize_text_chunk(text)
        if not normalized_text or self._websocket is None or self._eos_sent:
            return

        payload: Dict[str, Any] = {"text": normalized_text}
        if try_trigger_generation and not self.config.elevenlabs_auto_mode:
            payload["try_trigger_generation"] = True
        await self._websocket.send(json.dumps(payload))

    async def _receive_audio_loop(self) -> None:
        try:
            async for raw_message in self._websocket:
                message = json.loads(raw_message)
                audio = message.get("audio")
                if isinstance(audio, str) and audio:
                    await self.audio_queue.put(
                        {
                            "audio": audio,
                            "sample_rate": self._output_sample_rate(),
                            "sample_width": _DEFAULT_SAMPLE_WIDTH,
                            "channels": _DEFAULT_CHANNELS,
                        }
                    )
                if message.get("isFinal") is True:
                    break
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("ElevenLabs audio receive loop failed: %s", exc, exc_info=True)
        finally:
            self.running = False
            if self._processing_complete:
                self._processing_complete.set()
            if self._shutdown_requested and self.audio_queue is not None:
                await self.audio_queue.put(None)
            await self._close_websocket()

    async def _close_websocket(self) -> None:
        websocket = self._websocket
        self._websocket = None
        if websocket is None:
            return
        close = getattr(websocket, "close", None)
        if callable(close):
            try:
                await close()
            except Exception:
                logger.debug("ElevenLabs websocket close failed", exc_info=True)
