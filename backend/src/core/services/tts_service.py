"""
TTS Service for real-time text-to-speech synthesis.

Uses Piper TTS for local synthesis with CUDA->CPU fallback and periodic
CUDA retry when fallback mode is active.
"""

from __future__ import annotations

import asyncio
import queue
import time
from typing import Any, AsyncGenerator, Dict, Optional

from backend.src.core.config import AppConfig
from backend.src.core.services.tts_audio import prepare_audio_data, send_audio_chunk
from backend.src.core.services.tts_buffer import SentenceBuffer
from backend.src.core.services.tts_cuda import format_truncated_error, is_cuda_error
from backend.src.core.services.tts_worker import TtsWorker

import logging

logger = logging.getLogger(__name__)


class TTSService:
    """
    Text-to-speech service wrapper around Piper.
    """

    def __init__(self, config: AppConfig):
        self.config = config
        self.voice = None
        self.running = False
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.use_cuda = True
        self._cuda_fallback_time: Optional[float] = None
        self._cuda_retry_interval = 300.0
        self._cuda_retry_task: Optional[asyncio.Task] = None

        self.input_queue: "queue.Queue[Optional[str]]" = queue.Queue()
        self.audio_queue: Optional[asyncio.Queue] = None
        self._buffer = SentenceBuffer(max_size=500, logger=logger)
        self._processing_complete: Optional[asyncio.Event] = None
        self._worker: Optional[TtsWorker] = None

    async def initialize(self):
        """Initialize TTS runtime and background worker."""
        if not self.config.tts_model_path:
            logger.info(
                "TTS Service not initialized: tts_model_path not set. "
                "tts_enabled=%s, tts_model_path=%s",
                self.config.tts_enabled,
                self.config.tts_model_path,
            )
            return

        self.loop = asyncio.get_running_loop()
        self.audio_queue = asyncio.Queue()
        self._processing_complete = asyncio.Event()
        self._processing_complete.set()

        try:
            await self.loop.run_in_executor(None, self._start_worker)
            logger.info(
                "TTS Service initialized with model: %s", self.config.tts_model_path
            )
            if not self.use_cuda:
                self._start_cuda_retry_task()
        except Exception as e:
            logger.error(f"Failed to initialize TTS Service: {e}", exc_info=True)

    def _start_worker(self):
        """Load voice and start synthesis worker thread."""
        try:
            from piper import PiperVoice

            try:
                self.voice = PiperVoice.load(self.config.tts_model_path, use_cuda=True)
                self.use_cuda = True
                logger.info("TTS initialized with CUDA")
            except Exception as e:
                if not is_cuda_error(e):
                    raise
                logger.warning(
                    "TTS CUDA initialization failed. Falling back to CPU. Error: %s",
                    format_truncated_error(e),
                )
                self.voice = PiperVoice.load(self.config.tts_model_path, use_cuda=False)
                self.use_cuda = False
                logger.info("TTS initialized with CPU fallback")

            self.running = True
            self._worker = TtsWorker(
                input_queue=self.input_queue,
                on_synthesize=self._synthesize_with_fallback,
                on_complete=self._signal_processing_complete,
                logger=logger,
            )
            self._worker.start()
        except ImportError:
            logger.error("piper package not found. Please install piper-tts.")
        except Exception as e:
            logger.error(f"Error loading Piper model: {e}")
            raise

    def _signal_processing_complete(self) -> None:
        if self.loop and self._processing_complete:
            self.loop.call_soon_threadsafe(self._processing_complete.set)

    def _synthesize_text(self, text: str) -> None:
        for audio_chunk in self.voice.synthesize(text):
            if not self.running:
                break
            audio_data = prepare_audio_data(audio_chunk)
            send_audio_chunk(self.loop, self.audio_queue, audio_data)

    def _reload_with_cpu(self) -> None:
        from piper import PiperVoice

        self.voice = PiperVoice.load(self.config.tts_model_path, use_cuda=False)
        self.use_cuda = False
        self._cuda_fallback_time = time.time()
        logger.debug("TTS model reloaded with CPU")
        if self.loop and not self._cuda_retry_task:
            self._start_cuda_retry_task()

    def _start_cuda_retry_task(self) -> None:
        if not self.loop:
            return

        async def _cuda_retry_loop():
            while self.running and not self.use_cuda:
                try:
                    await asyncio.sleep(self._cuda_retry_interval)
                    if not self.running or self.use_cuda:
                        break
                    if self._cuda_fallback_time is None:
                        break
                    elapsed = time.time() - self._cuda_fallback_time
                    if elapsed < self._cuda_retry_interval:
                        continue

                    logger.info(
                        "Attempting to reload TTS model with CUDA after CPU fallback..."
                    )
                    try:
                        await self.loop.run_in_executor(None, self._try_reload_cuda)
                        if self.use_cuda:
                            logger.info(
                                "TTS successfully reloaded with CUDA - performance restored"
                            )
                            self._cuda_fallback_time = None
                            break
                    except Exception as e:
                        logger.debug(f"CUDA retry failed (will retry later): {e}")
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in CUDA retry loop: {e}", exc_info=True)

        self._cuda_retry_task = self.loop.create_task(_cuda_retry_loop())

    def _try_reload_cuda(self) -> None:
        from piper import PiperVoice

        try:
            self.voice = PiperVoice.load(self.config.tts_model_path, use_cuda=True)
            self.use_cuda = True
            logger.info("TTS model reloaded with CUDA successfully")
        except Exception as e:
            if is_cuda_error(e):
                logger.debug(f"CUDA reload still failing: {e}")
                raise
            logger.warning(f"Unexpected error during CUDA reload: {e}")
            raise

    def _synthesize_with_fallback(self, text: str) -> None:
        try:
            self._synthesize_text(text)
            return
        except Exception as e:
            if not is_cuda_error(e):
                logger.error(
                    "TTS synthesis error (non-CUDA): %s. Skipping this text.",
                    format_truncated_error(e),
                    exc_info=True,
                )
                return

            if not self.use_cuda:
                logger.warning(
                    "TTS synthesis failed (already using CPU but CUDA error persists): %s",
                    format_truncated_error(e),
                )
                return

            logger.debug(
                "TTS CUDA error during synthesis for text: '%s...'. "
                "Reloading TTS model with CPU fallback. Error: %s",
                text[:50],
                format_truncated_error(e),
            )

            try:
                self._reload_with_cpu()
                self._synthesize_text(text)
                logger.debug("TTS synthesis completed successfully with CPU fallback")
            except Exception as retry_error:
                logger.error(
                    "TTS CPU retry failed after CUDA error: %s. Skipping synthesis.",
                    retry_error,
                    exc_info=True,
                )

    async def shutdown(self):
        """Shutdown worker and retry task."""
        self.running = False
        if self._worker:
            self._worker.stop()

        if self._cuda_retry_task:
            self._cuda_retry_task.cancel()
            try:
                await self._cuda_retry_task
            except asyncio.CancelledError:
                pass

        self.input_queue.put(None)

    async def process_text(self, text_chunk: str):
        """Buffer incoming text and enqueue complete sentences for synthesis."""
        if not self.running:
            return

        if self._processing_complete:
            self._processing_complete.clear()

        for sentence in self._buffer.append(text_chunk):
            self.input_queue.put(sentence)

    async def flush(self):
        """Flush remaining sentence buffer and wait for processing completion."""
        text = self._buffer.flush()
        if text:
            logger.debug(f"Flushing TTS buffer: {text}")
            self.input_queue.put(text)

        self.input_queue.put(None)

        if self._processing_complete:
            self._processing_complete.clear()
            try:
                await asyncio.wait_for(self._processing_complete.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("TTS flush timeout - queue may still be processing")

    async def wait_until_finished(self, timeout: float = 10.0) -> bool:
        if not self._processing_complete:
            return True

        try:
            await asyncio.wait_for(self._processing_complete.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            logger.warning(f"TTS wait_until_finished timeout after {timeout}s")
            return False

    async def stream_audio(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream generated audio chunks from queue."""
        if not self.audio_queue:
            return

        while self.running:
            try:
                try:
                    data = await asyncio.wait_for(self.audio_queue.get(), timeout=0.5)
                    yield data
                    self.audio_queue.task_done()
                except asyncio.TimeoutError:
                    continue
            except asyncio.CancelledError:
                break
