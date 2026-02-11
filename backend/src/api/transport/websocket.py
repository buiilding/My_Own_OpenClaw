"""
Thread-safe WebSocket sender implementation.

Provides SafeWebSocket class that implements WebSocketSender Protocol
with queue-based message sending to ensure thread-safe operations.
"""

import asyncio
import logging
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

_QUEUE_PUT_TIMEOUT_SECONDS = 0.1
_DEFAULT_SEND_QUEUE_MAX_SIZE = 256
_SENDER_STOPPED_MESSAGE = "WebSocket sender stopped"


class SafeWebSocket:
    """
    Thread-safe WebSocket wrapper implementing WebSocketSender Protocol.

    PERFORMANCE FIX: Uses queue-based sender instead of lock to decouple message
    generation from network latency. This prevents slow network I/O from blocking
    other coroutines trying to send messages.

    WebSocket operations in FastAPI/Starlette are not safe for concurrent access.
    This wrapper uses a single sender task that pulls from a queue, ensuring
    serialized writes while allowing concurrent message enqueueing.

    Implements WebSocketSender Protocol to ensure type safety and enforce
    thread-safe usage throughout the codebase.
    """

    def __init__(
        self,
        websocket: WebSocket,
        max_queue_size: int = _DEFAULT_SEND_QUEUE_MAX_SIZE,
    ):
        """
        Initialize the safe WebSocket wrapper.

        Args:
            websocket: Underlying WebSocket connection
            max_queue_size: Maximum queued sends before backpressure
        """
        if max_queue_size <= 0:
            raise ValueError("max_queue_size must be > 0")

        self._websocket = websocket
        # Bounded queue adds backpressure and prevents unbounded memory growth.
        self._send_queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue_size)
        self._sender_task: Optional[asyncio.Task] = None
        self._closed = False
        self._sender_error: Optional[Exception] = None
        self._close_event = asyncio.Event()

    @staticmethod
    def _resolve_sender_exception(exc: Optional[Exception] = None) -> Exception:
        if exc is not None:
            return exc
        return RuntimeError(_SENDER_STOPPED_MESSAGE)

    @staticmethod
    def _set_future_result(future: Optional[asyncio.Future], result: None) -> None:
        if future is None or future.done():
            return
        future.set_result(result)

    @staticmethod
    def _set_future_exception(
        future: Optional[asyncio.Future],
        exc: Exception,
    ) -> None:
        if future is None or future.done():
            return
        future.set_exception(exc)

    def _drain_pending_queue(self, exc: Exception) -> None:
        """
        Fail all queued (not yet processed) sends.

        Prevents awaiters from hanging if the sender loop exits early.
        """
        while True:
            try:
                _msg_type, _data, _mode, future = self._send_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            self._set_future_exception(future, exc)

    async def _enqueue(
        self,
        item: tuple[str, Any, Optional[str], Optional[asyncio.Future]],
        *,
        allow_closed: bool = False,
    ) -> None:
        """
        Enqueue message with bounded backpressure and sender-liveness checks.
        """
        while True:
            if self._closed and not allow_closed:
                raise RuntimeError("WebSocket is closed")

            if self._sender_task is not None and self._sender_task.done():
                raise self._resolve_sender_exception(self._sender_error)

            try:
                await asyncio.wait_for(
                    self._send_queue.put(item),
                    timeout=_QUEUE_PUT_TIMEOUT_SECONDS,
                )
                return
            except asyncio.TimeoutError:
                # Re-check close/sender state before retrying.
                continue

    def _ensure_sender_task(self) -> None:
        if self._sender_task is None:
            self._sender_task = asyncio.create_task(self._sender_loop())

    async def _sender_loop(self) -> None:
        """
        Background task that pulls messages from queue and sends them.

        This decouples message generation (fast) from network I/O (slow),
        allowing multiple coroutines to enqueue messages concurrently without
        blocking each other.
        """
        try:
            while True:
                msg_type, data, mode, future = await self._send_queue.get()

                try:
                    if msg_type == "json":
                        await self._websocket.send_json(data, mode=mode)
                        self._set_future_result(future, None)
                        continue

                    if msg_type == "text":
                        await self._websocket.send_text(data)
                        self._set_future_result(future, None)
                        continue

                    if msg_type == "close":
                        await self._websocket.close(code=data, reason=mode)
                        self._set_future_result(future, None)
                        break

                    unknown_type_error = RuntimeError(
                        f"Unknown websocket queue message type: {msg_type}"
                    )
                    self._set_future_exception(future, unknown_type_error)
                    self._sender_error = unknown_type_error
                    break

                except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                    logger.debug("Send failed (connection closed): %s", e)
                    self._set_future_exception(future, e)
                    self._sender_error = e
                    break
                except Exception as e:
                    logger.error("Error in sender loop: %s", e, exc_info=True)
                    self._set_future_exception(future, e)
                    self._sender_error = e
                    break

        finally:
            self._closed = True
            sender_exc = self._resolve_sender_exception(self._sender_error)
            self._drain_pending_queue(sender_exc)
            self._close_event.set()

    async def send_json(self, data: Any, mode: str = "text") -> None:
        """
        Thread-safe JSON send (non-blocking enqueue).

        Args:
            data: JSON-serializable data to send
            mode: Send mode (default: "text")

        Raises:
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        if self._closed:
            raise self._resolve_sender_exception(self._sender_error)

        self._ensure_sender_task()
        future = asyncio.get_running_loop().create_future()
        await self._enqueue(("json", data, mode, future))
        await future

    async def send_text(self, data: str) -> None:
        """
        Thread-safe text send (non-blocking enqueue).

        Args:
            data: Text data to send

        Raises:
            RuntimeError: If connection error occurs
            ConnectionError: If connection error occurs
        """
        if self._closed:
            raise self._resolve_sender_exception(self._sender_error)

        self._ensure_sender_task()
        future = asyncio.get_running_loop().create_future()
        await self._enqueue(("text", data, None, future))
        await future

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:
        """
        Thread-safe close.

        Args:
            code: Close code (default: 1000)
            reason: Optional close reason
        """
        if self._closed:
            return

        self._closed = True

        # No sender loop yet: close directly.
        if self._sender_task is None:
            try:
                await self._websocket.close(code=code, reason=reason)
            except Exception as e:
                logger.debug("Close failed (already closed): %s", e)
            finally:
                self._close_event.set()
            return

        # Sender exists: enqueue close and let sender loop serialize it.
        future = asyncio.get_running_loop().create_future()
        try:
            await self._enqueue(("close", code, reason, future), allow_closed=True)
            await future
        except Exception as e:
            logger.debug(
                "Close enqueue/flush failed, falling back to direct close: %s", e
            )
            try:
                await self._websocket.close(code=code, reason=reason)
            except Exception as close_error:
                logger.debug(
                    "Direct close fallback failed (already closed): %s", close_error
                )
        finally:
            await self._close_event.wait()

    async def accept(self) -> None:
        """
        Accept connection (usually called before locking matters).
        """
        await self._websocket.accept()
