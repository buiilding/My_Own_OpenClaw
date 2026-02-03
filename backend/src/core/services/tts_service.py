"""
TTS Service for Real-time Text-to-Speech Synthesis.

Uses Piper TTS for local, low-latency synthesis.
"""
import asyncio
import base64
import logging
import queue
import threading
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)

CUDA_ERROR_KEYWORDS = (
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
    "CUBLAS_STATUS",
)


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
        # PERMANENT CPU TRAP FIX: Track when we switched to CPU and last retry attempt
        self._cuda_fallback_time: Optional[float] = None  # Timestamp when switched to CPU
        self._cuda_retry_interval = 300.0  # Retry CUDA every 5 minutes
        self._cuda_retry_task: Optional[asyncio.Task] = None

        # Queues
        self.input_queue = queue.Queue()  # Sentences to synthesize
        self.audio_queue: Optional[asyncio.Queue] = None  # Audio chunks to stream

        # Buffer for sentence detection (use list for efficient appends)
        self.buffer_parts: List[str] = []
        self.delimiters = {".", "!", "?", "\n", ";", ":"}
        self._buffer_lock = threading.Lock()  # Protect buffer access
        
        # DOS PROTECTION: Hard limit on buffer size to prevent OOM attacks
        # If buffer exceeds this without finding a delimiter, force a split/flush
        self.MAX_BUFFER_SIZE = 500  # Maximum characters to buffer before forcing split

        # Thread
        self.worker_thread: Optional[threading.Thread] = None
        
        # CRITICAL FIX #3: Event for waiting until processing is complete
        # This replaces busy-wait polling and properly encapsulates TTS state
        self._processing_complete: Optional[asyncio.Event] = None

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
        self._processing_complete = asyncio.Event()
        self._processing_complete.set()  # Initially idle

        try:
            # Load model in a separate thread to avoid blocking the event loop
            await self.loop.run_in_executor(None, self._start_worker)
            logger.info(
                f"TTS Service initialized with model: {self.config.tts_model_path}"
            )
            
            # PERMANENT CPU TRAP FIX: Start CUDA retry task if we're in CPU mode
            if not self.use_cuda:
                self._start_cuda_retry_task()
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

                if self._is_cuda_error(e):
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

    def _is_cuda_error(self, error: Exception) -> bool:
        """
        Check if an exception is a CUDA/CUDNN related error.
        
        Args:
            error: Exception to check
            
        Returns:
            True if error is CUDA-related, False otherwise
        """
        error_msg = str(error)
        error_type = type(error).__name__
        
        return (
            "ONNXRuntimeError" in error_type or
            "ONNXRuntimeError" in error_msg or
            any(keyword in error_msg for keyword in CUDA_ERROR_KEYWORDS)
        )

    def _prepare_audio_data(self, audio_chunk) -> Dict[str, Any]:
        """
        Prepare audio chunk data for transmission.
        
        Args:
            audio_chunk: Audio chunk from Piper voice synthesis
            
        Returns:
            Dictionary with audio data and metadata
        """
        return {
            "audio": base64.b64encode(audio_chunk.audio_int16_bytes).decode("utf-8"),
            "sample_rate": audio_chunk.sample_rate,
            "sample_width": audio_chunk.sample_width,
            "channels": audio_chunk.sample_channels,
        }

    def _send_audio_chunk(self, audio_data: Dict[str, Any]) -> None:
        """
        Send audio chunk to async queue safely.
        
        Args:
            audio_data: Audio data dictionary
        """
        if self.loop and self.audio_queue:
            self.loop.call_soon_threadsafe(
                self.audio_queue.put_nowait, audio_data
            )

    def _synthesize_text(self, text: str) -> bool:
        """
        Synthesize text to audio chunks and send to queue.
        
        Args:
            text: Text to synthesize
            
        Returns:
            True if synthesis succeeded, False otherwise
        """
        for audio_chunk in self.voice.synthesize(text):
            if not self.running:
                break
            audio_data = self._prepare_audio_data(audio_chunk)
            self._send_audio_chunk(audio_data)
        return True

    def _reload_with_cpu(self) -> None:
        """
        Reload TTS model with CPU fallback.
        
        PERMANENT CPU TRAP FIX: Records timestamp when switching to CPU and starts
        retry task to periodically attempt CUDA reload.
        
        Raises:
            Exception: If reload fails
        """
        import time
        from piper import PiperVoice
        self.voice = PiperVoice.load(
            self.config.tts_model_path, use_cuda=False
        )
        self.use_cuda = False
        self._cuda_fallback_time = time.time()
        logger.debug("TTS model reloaded with CPU")
        
        # Start retry task if not already running
        if self.loop and not self._cuda_retry_task:
            self._start_cuda_retry_task()
    
    def _start_cuda_retry_task(self) -> None:
        """
        Start background task to periodically retry CUDA initialization.
        
        PERMANENT CPU TRAP FIX: After switching to CPU due to transient GPU errors,
        this task periodically attempts to reload with CUDA to recover performance.
        """
        if not self.loop:
            return
        
        async def _cuda_retry_loop():
            """Background task that periodically attempts CUDA reload."""
            while self.running and not self.use_cuda:
                try:
                    # Wait for retry interval
                    await asyncio.sleep(self._cuda_retry_interval)
                    
                    if not self.running or self.use_cuda:
                        break
                    
                    # Check if enough time has passed since fallback
                    import time
                    if self._cuda_fallback_time is None:
                        break
                    
                    elapsed = time.time() - self._cuda_fallback_time
                    if elapsed < self._cuda_retry_interval:
                        continue
                    
                    logger.info("Attempting to reload TTS model with CUDA after CPU fallback...")
                    
                    # Try to reload with CUDA in executor
                    try:
                        await self.loop.run_in_executor(None, self._try_reload_cuda)
                        if self.use_cuda:
                            logger.info("TTS successfully reloaded with CUDA - performance restored")
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
        """
        Attempt to reload TTS model with CUDA.
        
        Called from executor thread to avoid blocking event loop.
        """
        from piper import PiperVoice
        try:
            self.voice = PiperVoice.load(
                self.config.tts_model_path, use_cuda=True
            )
            self.use_cuda = True
            logger.info("TTS model reloaded with CUDA successfully")
        except Exception as e:
            # Still a CUDA error - keep using CPU
            if self._is_cuda_error(e):
                logger.debug(f"CUDA reload still failing: {e}")
                raise
            else:
                # Non-CUDA error - unexpected, but keep using CPU
                logger.warning(f"Unexpected error during CUDA reload: {e}")
                raise

    def _synthesize_with_fallback(self, text: str) -> bool:
        """
        Synthesize text with CUDA fallback logic.
        
        Handles CUDA errors by falling back to CPU and retrying.
        This method encapsulates all the retry logic to keep the worker loop clean.
        
        Args:
            text: Text to synthesize
            
        Returns:
            True if synthesis succeeded, False otherwise
        """
        try:
            # Try synthesis with current voice (CUDA or CPU)
            self._synthesize_text(text)
            return True
        except Exception as e:
            # Check if it's a CUDA error
            if not self._is_cuda_error(e):
                # Non-CUDA error - log and fail
                logger.error(
                    f"TTS synthesis error (non-CUDA): {str(e)[:200]}. "
                    f"Skipping this text.",
                    exc_info=True
                )
                return False
            
            # CUDA error detected
            if not self.use_cuda:
                # Already using CPU but still getting CUDA errors - this is unexpected
                logger.warning(
                    f"TTS synthesis failed (already using CPU but CUDA error persists): "
                    f"{str(e)[:200]}. Skipping this text."
                )
                return False
            
            # CUDA error and we're using CUDA - try CPU fallback
            logger.debug(
                f"TTS CUDA error during synthesis for text: '{text[:50]}...'. "
                f"GPU error detected. Reloading TTS model with CPU fallback. "
                f"Error: {str(e)[:200]}"
            )
            
            try:
                # Reload with CPU
                self._reload_with_cpu()
                logger.debug("TTS model reloaded with CPU - retrying synthesis")
                
                # Retry synthesis with CPU
                try:
                    self._synthesize_text(text)
                    logger.debug("TTS synthesis completed successfully with CPU fallback")
                    return True
                except Exception as retry_error:
                    # CPU retry failed - this is a real problem
                    logger.error(
                        f"TTS CPU retry also failed after CUDA error: {retry_error}. "
                        f"Skipping synthesis for this text.",
                        exc_info=True
                    )
                    return False
            except Exception as reload_error:
                # Reload failed - this is a real problem
                logger.error(
                    f"Failed to reload TTS model with CPU after CUDA error: {reload_error}. "
                    f"Skipping synthesis for this text.",
                    exc_info=True
                )
                return False

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
                    # CRITICAL FIX #3: Signal completion when sentinel is processed
                    # This indicates all text has been processed
                    if self.loop and self._processing_complete:
                        self.loop.call_soon_threadsafe(self._processing_complete.set)
                    continue

                if not text.strip():
                    self.input_queue.task_done()
                    # Check if queue is now empty (after processing empty text)
                    if self.input_queue.empty() and self.loop and self._processing_complete:
                        self.loop.call_soon_threadsafe(self._processing_complete.set)
                    continue

                logger.debug(f"Synthesizing: {text}")

                # Synthesize with fallback logic (handles CUDA errors internally)
                self._synthesize_with_fallback(text)

                # Mark task done
                self.input_queue.task_done()
                
                # CRITICAL FIX #3: Check if queue is empty and signal completion
                # This allows wait_until_finished() to properly detect when processing is done
                if self.input_queue.empty() and self.loop and self._processing_complete:
                    # Queue is empty, all processing complete
                    self.loop.call_soon_threadsafe(self._processing_complete.set)

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
        
        # PERMANENT CPU TRAP FIX: Cancel CUDA retry task
        if self._cuda_retry_task:
            self._cuda_retry_task.cancel()
            try:
                await self._cuda_retry_task
            except asyncio.CancelledError:
                pass
        
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

        # CRITICAL FIX #3: Clear completion event when new text arrives
        if self._processing_complete:
            self._processing_complete.clear()

        with self._buffer_lock:
            self.buffer_parts.append(text_chunk)
            self._process_buffer()

    def _process_buffer(self):
        """
        Split buffer into sentences for synthesis.
        Simple sentence-buffering: split on natural boundaries, preserve all text.
        
        DOS PROTECTION: If buffer exceeds MAX_BUFFER_SIZE without finding a delimiter,
        forces a split to prevent unbounded memory growth from malicious input or bugs.
        """
        # Join buffer parts into single string for processing
        buffer = "".join(self.buffer_parts)
        if not buffer:
            return
        
        # DOS PROTECTION: Check if buffer exceeds hard limit without delimiter
        # If so, force a split at the limit to prevent OOM attacks
        forced_split = self._force_split_buffer(buffer)
        if forced_split:
            forced_sentence, remaining_after_split, split_pos = forced_split
            if forced_sentence:
                logger.warning(
                    f"TTS buffer exceeded {self.MAX_BUFFER_SIZE} chars without delimiter. "
                    f"Forcing split at position {split_pos} to prevent OOM."
                )
                self.input_queue.put(forced_sentence)

            # TTS BUFFER STALL FIX: Process remaining text immediately instead of returning.
            self.buffer_parts.clear()
            if remaining_after_split:
                self.buffer_parts.append(remaining_after_split)
                self._process_buffer()
            return
        
        # Clear buffer parts - we'll rebuild with remaining text
        self.buffer_parts.clear()
            
        sentences, remaining = self._split_sentences(buffer)
        for sentence in sentences:
            self.input_queue.put(sentence)
        if remaining:
            self.buffer_parts.append(remaining)

    def _force_split_buffer(self, buffer: str) -> Optional[tuple[str, str, int]]:
        if len(buffer) <= self.MAX_BUFFER_SIZE:
            return None

        split_pos = self.MAX_BUFFER_SIZE
        for i in range(
            self.MAX_BUFFER_SIZE - 1, max(0, self.MAX_BUFFER_SIZE - 100), -1
        ):
            if buffer[i].isspace():
                split_pos = i + 1
                break

        forced_sentence = buffer[:split_pos].strip()
        remaining_after_split = buffer[split_pos:].strip()
        return forced_sentence, remaining_after_split, split_pos

    def _split_sentences(self, buffer: str) -> tuple[list[str], str]:
        sentences: list[str] = []
        start = 0
        i = 0

        while i < len(buffer):
            char = buffer[i]

            if char in self.delimiters:
                if char == ".":
                    if self._should_skip_period_split(buffer, i):
                        i += 1
                        continue

                sentence = buffer[start : i + 1]
                clean_sentence = sentence.strip()
                if clean_sentence:
                    sentences.append(clean_sentence)

                start = i + 1

            i += 1

        remaining = buffer[start:]
        return sentences, remaining

    def _should_skip_period_split(self, buffer: str, index: int) -> bool:
        if index + 1 >= len(buffer):
            return True
        next_char = buffer[index + 1]
        return next_char.isalnum() or next_char in {"`", "'", '"', "-", "_"}

    async def flush(self):
        """
        Flush any remaining text in the buffer.
        
        PREMATURE TTS FLUSH FIX: Clears _processing_complete before waiting to ensure
        we wait for the flushed text to be processed, not a previous completion signal.
        """
        with self._buffer_lock:
            # Get any remaining text
            text = "".join(self.buffer_parts).strip()
            if text:
                logger.debug(f"Flushing TTS buffer: {text}")
                self.input_queue.put(text)
            
            # Sentinel to signal end of stream to worker
            self.input_queue.put(None)
            
            self.buffer_parts.clear()
        
        # PREMATURE TTS FLUSH FIX: Clear completion event before waiting
        # This ensures we wait for the flushed text to be processed, not a previous
        # completion signal that was already set. Without this, if the event was set
        # from a previous operation, wait() returns immediately and shutdown() is called
        # before the flushed text is synthesized, causing audio truncation.
        if self._processing_complete:
            # Clear the event to ensure we wait for new completion signal
            self._processing_complete.clear()
            # Wait for queue to drain (with timeout to prevent hanging)
            try:
                await asyncio.wait_for(
                    self._processing_complete.wait(),
                    timeout=5.0  # Maximum 5 seconds for flush
                )
            except asyncio.TimeoutError:
                logger.warning("TTS flush timeout - queue may still be processing")
    
    async def wait_until_finished(self, timeout: float = 10.0) -> bool:
        """
        Wait until all queued text has been processed and audio generated.
        
        CRITICAL FIX #3: Replaces busy-wait polling with proper async wait.
        This method properly encapsulates TTS state and avoids coupling callers
        to internal queue implementation.
        
        Args:
            timeout: Maximum time to wait in seconds
            
        Returns:
            True if processing completed, False if timeout occurred
        """
        if not self._processing_complete:
            return True  # Not initialized, consider it "done"
        
        try:
            await asyncio.wait_for(self._processing_complete.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            logger.warning(f"TTS wait_until_finished timeout after {timeout}s")
            return False

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
