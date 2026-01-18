"""
TTS Service for Real-time Text-to-Speech Synthesis.

Uses Piper TTS for local, low-latency synthesis.
"""
import asyncio
import base64
import logging
import queue
import threading
from typing import Any, AsyncGenerator, Dict, Optional

from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)


class TTSService:
    """
    Service for text-to-speech synthesis using Piper.

    Handles sentence detection from text stream and processes
    sentences in a background thread to generate audio chunks.
    """

    def __init__(self, config: AppConfig):
        self.config = config
        self.voice = None
        self.running = False
        self.loop = None
        self.use_cuda = True  # Track whether we're using CUDA or CPU

        # Queues
        self.input_queue = queue.Queue()  # Sentences to synthesize
        self.audio_queue: Optional[asyncio.Queue] = None  # Audio chunks to stream

        # Buffer for sentence detection
        self.buffer = ""
        self.delimiters = {".", "!", "?", "\n", ";", ":"}
        self._buffer_lock = threading.Lock()  # Protect buffer access

        # Thread
        self.worker_thread: Optional[threading.Thread] = None

    async def initialize(self):
        """Initialize the TTS service."""
        # tts_enabled is always True (hardcoded in code, not configurable)
        # Only check if model path is set
        if not self.config.tts_model_path:
            logger.info(
                f"TTS Service not initialized: tts_model_path not set. "
                f"tts_enabled={self.config.tts_enabled} (always True), "
                f"tts_model_path={self.config.tts_model_path}"
            )
            return

        self.loop = asyncio.get_running_loop()
        self.audio_queue = asyncio.Queue()

        try:
            # Load model in a separate thread to avoid blocking the event loop
            await self.loop.run_in_executor(None, self._start_worker)
            logger.info(
                f"TTS Service initialized with model: {self.config.tts_model_path}"
            )
        except Exception as e:
            logger.error(f"Failed to initialize TTS Service: {e}", exc_info=True)

    def _start_worker(self):
        """Load model and start worker thread (runs in executor)."""
        try:
            from piper import PiperVoice

            # Try CUDA first, fall back to CPU if GPU errors occur
            try:
                self.voice = PiperVoice.load(
                    self.config.tts_model_path, use_cuda=True
                )
                self.use_cuda = True
                logger.info("TTS initialized with CUDA")
            except Exception as e:
                # If CUDA fails (any CUDA/CUDNN error), try CPU fallback
                error_msg = str(e)
                error_type = type(e).__name__
                
                # Check if it's an ONNXRuntimeError or CUDA-related error
                is_cuda_error = (
                    "ONNXRuntimeError" in error_type or
                    "ONNXRuntimeError" in error_msg or
                    any(keyword in error_msg for keyword in [
                        "Failed to allocate memory",
                        "RUNTIME_EXCEPTION",
                        "CUBLAS_STATUS_ALLOC_FAILED",
                        "CUBLAS failure",
                        "CUDNN",
                        "CUDA",
                        "cuda_call",
                        "cublas",
                        "cudnn",
                        "CUDNN_STATUS",
                        "CUBLAS_STATUS"
                    ])
                )
                
                if is_cuda_error:
                    logger.warning(
                        f"TTS CUDA initialization failed (GPU error detected). "
                        f"Falling back to CPU. Error: {error_msg[:200]}"
                    )
                    try:
                        self.voice = PiperVoice.load(
                            self.config.tts_model_path, use_cuda=False
                        )
                        self.use_cuda = False
                        logger.info("TTS initialized with CPU fallback")
                    except Exception as cpu_error:
                        logger.error(f"TTS CPU initialization also failed: {cpu_error}")
                        raise
                else:
                    raise  # Re-raise if it's not a CUDA/CUDNN error

            self.running = True
            self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
            self.worker_thread.start()

        except ImportError:
            logger.error("piper package not found. Please install piper-tts.")
        except Exception as e:
            logger.error(f"Error loading Piper model: {e}")
            raise

    def _worker_loop(self):
        """Background thread loop for synthesis."""
        logger.debug("TTS Worker thread started")
        while self.running:
            try:
                # Get sentence from queue
                text = self.input_queue.get()
                
                # Check for sentinel (None) which means end of current stream
                # We don't break the loop (keep thread alive), just mark task done
                if text is None:
                    self.input_queue.task_done()
                    continue

                if not text.strip():
                    self.input_queue.task_done()
                    continue

                logger.debug(f"Synthesizing: {text}")

                # Synthesize
                # voice.synthesize yields chunks of audio data
                synthesis_successful = False
                try:
                    for audio_chunk in self.voice.synthesize(text):
                        if not self.running:
                            break

                        # Prepare audio data
                        # audio_chunk has .audio_int16_bytes (raw PCM)
                        audio_data = {
                            "audio": base64.b64encode(audio_chunk.audio_int16_bytes).decode(
                                "utf-8"
                            ),
                            "sample_rate": audio_chunk.sample_rate,
                            "sample_width": audio_chunk.sample_width,
                            "channels": audio_chunk.sample_channels,
                        }

                        # Push to async queue safely
                        if self.loop and self.audio_queue:
                            self.loop.call_soon_threadsafe(
                                self.audio_queue.put_nowait, audio_data
                            )
                    synthesis_successful = True
                except Exception as e:
                    # Handle CUDA/CUDNN errors during synthesis
                    error_msg = str(e)
                    error_type = type(e).__name__
                    
                    # Check if it's an ONNXRuntimeError or CUDA-related error
                    is_cuda_error = (
                        "ONNXRuntimeError" in error_type or
                        "ONNXRuntimeError" in error_msg or
                        any(keyword in error_msg for keyword in [
                            "Failed to allocate memory",
                            "RUNTIME_EXCEPTION",
                            "CUBLAS_STATUS_ALLOC_FAILED",
                            "CUBLAS failure",
                            "CUDNN",
                            "CUDA",
                            "cuda_call",
                            "cublas",
                            "cudnn",
                            "CUDNN_STATUS",
                            "CUBLAS_STATUS"
                        ])
                    )
                    
                    if is_cuda_error and self.use_cuda:
                        # CUDA error during synthesis - reload with CPU
                        # Log at DEBUG level initially - will upgrade to WARNING if fallback fails
                        logger.debug(
                            f"TTS CUDA error during synthesis for text: '{text[:50]}...'. "
                            f"GPU error detected. Reloading TTS model with CPU fallback. "
                            f"Error: {error_msg[:200]}"
                        )
                        try:
                            # Reload model with CPU
                            from piper import PiperVoice
                            self.voice = PiperVoice.load(
                                self.config.tts_model_path, use_cuda=False
                            )
                            self.use_cuda = False
                            logger.debug("TTS model reloaded with CPU - retrying synthesis")
                            
                            # Retry synthesis with CPU
                            try:
                                for audio_chunk in self.voice.synthesize(text):
                                    if not self.running:
                                        break
                                    audio_data = {
                                        "audio": base64.b64encode(audio_chunk.audio_int16_bytes).decode("utf-8"),
                                        "sample_rate": audio_chunk.sample_rate,
                                        "sample_width": audio_chunk.sample_width,
                                        "channels": audio_chunk.sample_channels,
                                    }
                                    if self.loop and self.audio_queue:
                                        self.loop.call_soon_threadsafe(
                                            self.audio_queue.put_nowait, audio_data
                                        )
                                synthesis_successful = True
                                logger.debug(f"TTS synthesis completed successfully with CPU fallback")
                            except Exception as retry_error:
                                # CPU retry failed - this is a real problem, log as ERROR
                                logger.error(
                                    f"TTS CPU retry also failed after CUDA error: {retry_error}. "
                                    f"Skipping synthesis for this text.",
                                    exc_info=True
                                )
                                synthesis_successful = False
                                raise  # Re-raise to be caught by outer handler if needed
                        except Exception as reload_error:
                            # Reload failed - this is a real problem, log as ERROR
                            logger.error(
                                f"Failed to reload TTS model with CPU after CUDA error: {reload_error}. "
                                f"Skipping synthesis for this text.",
                                exc_info=True
                            )
                            synthesis_successful = False
                    elif is_cuda_error:
                        # Already using CPU but still getting CUDA errors - skip
                        logger.warning(
                            f"TTS synthesis failed (already using CPU but CUDA error persists): {error_msg[:200]}. "
                            f"Skipping this text."
                        )
                        synthesis_successful = False
                    else:
                        # Different error - log and skip (don't re-raise to avoid crashing worker thread)
                        logger.error(
                            f"TTS synthesis error (non-CUDA): {error_msg[:200]}. "
                            f"Skipping this text."
                        )
                        synthesis_successful = False

                # Mark task done (synthesis_successful tracks if we successfully handled the error)
                self.input_queue.task_done()

            except Exception as e:
                logger.error(f"TTS Worker Error: {e}", exc_info=True)
                # Ensure task is marked done even on error
                try:
                    self.input_queue.task_done()
                except ValueError:
                    pass  # Task already done

        logger.debug("TTS Worker thread stopped")

    async def shutdown(self):
        """Shutdown the service."""
        self.running = False
        self.input_queue.put(None)
        if self.worker_thread:
            # We can't join the thread if we are in the loop calling this,
            # if this was running in the thread... but it's not.
            pass

    async def process_text(self, text_chunk: str):
        """
        Process a text chunk: buffer -> detect sentences -> queue for synthesis.
        """
        if not self.running:
            return

        with self._buffer_lock:
            self.buffer += text_chunk
            self._process_buffer()

    def _process_buffer(self):
        """
        Split buffer into sentences for synthesis.
        Simple sentence-buffering: split on natural boundaries, preserve all text.
        """
        if not self.buffer:
            return
            
        start = 0
        i = 0
        processed_count = 0
        while i < len(self.buffer):
            char = self.buffer[i]
            
            # Check for delimiters
            if char in self.delimiters:
                # Special handling for period to avoid splitting filenames
                if char == ".":
                    # Look ahead - if next char is NOT whitespace/newline/EOF, skip splitting
                    # This handles: .env, file.txt, version 1.0, etc.
                    # Also handles backticks: `.env` should not split
                    if i + 1 < len(self.buffer):
                        next_char = self.buffer[i + 1]
                        # If next char is alphanumeric or special filename chars, it's part of a word/filename
                        if next_char.isalnum() or next_char in {"`", "'", '"', "-", "_"}:
                            i += 1
                            continue
                    # If at end of buffer, don't split yet (wait for more text or flush)
                    else:
                        # End of current buffer, don't split yet - let it accumulate
                        i += 1
                        continue

                # Extract sentence up to and including the delimiter
                sentence = self.buffer[start : i + 1]
                
                # Queue non-empty sentences
                clean_sentence = sentence.strip()
                if clean_sentence:
                    self.input_queue.put(clean_sentence)
                
                start = i + 1
            
            i += 1

        # Keep remaining text that doesn't end with a delimiter
        self.buffer = self.buffer[start:]

    async def flush(self):
        """Flush any remaining text in the buffer."""
        with self._buffer_lock:
            # Get any remaining text
            text = self.buffer.strip()
            if text:
                logger.debug(f"Flushing TTS buffer: {text}")
                self.input_queue.put(text)
            
            # Sentinel to signal end of stream to worker
            self.input_queue.put(None)
            
            self.buffer = ""
        
        # Wait a bit for the queue to process (but don't block forever)
        # The worker thread will process items asynchronously
        await asyncio.sleep(0.5)  # Increased delay to allow queue processing

    async def stream_audio(self) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream generated audio chunks from the queue.
        """
        if not self.audio_queue:
            return

        while self.running:
            try:
                # Wait for audio data with timeout to allow checking running state
                # But queue.get() is a coroutine
                try:
                    data = await asyncio.wait_for(self.audio_queue.get(), timeout=0.5)
                    yield data
                    self.audio_queue.task_done()
                except asyncio.TimeoutError:
                    continue
            except asyncio.CancelledError:
                break
