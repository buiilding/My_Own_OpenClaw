"""WindieOS-owned local transcription websocket route."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.src.api.deps import SessionManagerDep
from backend.src.api.services.transcription.audio_frames import parse_gateway_audio_frame
from backend.src.api.services.transcription.factory import (
    create_transcription_provider_session,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/transcription")
async def transcription_websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManagerDep,
) -> None:
    """Expose a single local STT websocket protocol regardless of provider."""
    await websocket.accept()

    send_lock = asyncio.Lock()
    provider_session = create_transcription_provider_session(session_manager.config)
    receive_task: asyncio.Task | None = None
    provider_stream_task: asyncio.Task | None = None

    async def send_event(payload: dict[str, object]) -> None:
        async with send_lock:
            await websocket.send_json(payload)

    try:
        await send_event({"type": "status", "client_id": uuid4().hex})
        await provider_session.connect()
        provider_stream_task = asyncio.create_task(provider_session.stream_events(send_event))
        receive_task = asyncio.create_task(websocket.receive())

        while True:
            done, _pending = await asyncio.wait(
                {receive_task, provider_stream_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if provider_stream_task in done:
                provider_stream_task.result()
                break

            assert receive_task is not None
            message = receive_task.result()
            if message.get("type") == "websocket.disconnect":
                break

            text_payload = message.get("text")
            binary_payload = message.get("bytes")
            if text_payload is not None:
                try:
                    control_message = json.loads(text_payload)
                except json.JSONDecodeError:
                    logger.warning(
                        "Ignoring invalid transcription control payload: %r",
                        text_payload,
                    )
                else:
                    if isinstance(control_message, dict):
                        await provider_session.handle_control_message(control_message)
            elif binary_payload is not None:
                try:
                    sample_rate, audio_bytes = parse_gateway_audio_frame(binary_payload)
                except ValueError as exc:
                    logger.warning("Ignoring invalid transcription audio frame: %s", exc)
                else:
                    await provider_session.handle_audio_chunk(audio_bytes, sample_rate)

            receive_task = asyncio.create_task(websocket.receive())

    except WebSocketDisconnect:
        logger.info("Transcription websocket disconnected")
    except Exception as exc:
        logger.error("Transcription websocket failed: %s", exc, exc_info=True)
        try:
            await send_event({"type": "error", "message": str(exc)})
        except Exception:
            logger.debug("Failed to send transcription error event", exc_info=True)
    finally:
        if receive_task is not None and not receive_task.done():
            receive_task.cancel()
        if provider_stream_task is not None and not provider_stream_task.done():
            provider_stream_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await provider_stream_task
        await provider_session.close()
        with contextlib.suppress(Exception):
            await websocket.close()
