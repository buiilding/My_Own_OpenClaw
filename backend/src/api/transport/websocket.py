"""
Thread-safe WebSocket sender implementation.

Provides SafeWebSocket class that implements WebSocketSender Protocol
with queue-based message sending to ensure thread-safe operations.
"""
import asyncio
import logging
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect

from backend.src.api.transport.protocol import WebSocketSender

logger = logging.getLogger(__name__)


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
    
    def __init__(self, websocket: WebSocket):
        """
        Initialize the safe WebSocket wrapper.
        
        Args:
            websocket: Underlying WebSocket connection
        """
        self._websocket = websocket
        # PERFORMANCE FIX: Use unbounded queue to decouple senders from network I/O
        self._send_queue: asyncio.Queue = asyncio.Queue()
        self._sender_task: Optional[asyncio.Task] = None
        self._closed = False
        self._close_event = asyncio.Event()

    async def _sender_loop(self) -> None:
        """
        Background task that pulls messages from queue and sends them.
        
        This decouples message generation (fast) from network I/O (slow),
        allowing multiple coroutines to enqueue messages concurrently without
        blocking each other.
        """
        try:
            while not self._closed:
                try:
                    # Get message from queue (with timeout to check closed flag)
                    try:
                        msg_type, data, mode, future = await asyncio.wait_for(
                            self._send_queue.get(),
                            timeout=0.1
                        )
                    except asyncio.TimeoutError:
                        continue
                    
                    # Send the message
                    try:
                        if msg_type == "json":
                            await self._websocket.send_json(data, mode=mode)
                        elif msg_type == "text":
                            await self._websocket.send_text(data)
                        elif msg_type == "close":
                            await self._websocket.close(code=data, reason=mode)
                            break
                        
                        # Signal completion
                        if future is not None:
                            future.set_result(None)
                    
                    except (WebSocketDisconnect, RuntimeError, ConnectionError) as e:
                        logger.debug(f"Send failed (connection closed): {e}")
                        # Signal error to waiting coroutine
                        if future is not None:
                            future.set_exception(e)
                        break
                
                except Exception as e:
                    logger.error(f"Error in sender loop: {e}", exc_info=True)
                    if future is not None:
                        future.set_exception(e)
                    break
        
        finally:
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
            raise RuntimeError("WebSocket is closed")
        
        # Start sender task if not already started
        if self._sender_task is None:
            self._sender_task = asyncio.create_task(self._sender_loop())
        
        # Create future to wait for completion
        future = asyncio.Future()
        await self._send_queue.put(("json", data, mode, future))
        
        # Wait for send to complete (or error)
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
            raise RuntimeError("WebSocket is closed")
        
        # Start sender task if not already started
        if self._sender_task is None:
            self._sender_task = asyncio.create_task(self._sender_loop())
        
        # Create future to wait for completion
        future = asyncio.Future()
        await self._send_queue.put(("text", data, None, future))
        
        # Wait for send to complete (or error)
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
        
        # Enqueue close message
        if self._sender_task is not None:
            await self._send_queue.put(("close", code, reason, None))
            # Wait for sender to finish
            await self._close_event.wait()
            # Cancel sender task if still running
            if not self._sender_task.done():
                self._sender_task.cancel()
                try:
                    await self._sender_task
                except asyncio.CancelledError:
                    pass
        else:
            # No sender task, close directly
            try:
                await self._websocket.close(code=code, reason=reason)
            except Exception as e:
                logger.debug(f"Close failed (already closed): {e}")

    async def accept(self) -> None:
        """
        Accept connection (usually called before locking matters).
        """
        await self._websocket.accept()
