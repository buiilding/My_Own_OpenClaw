"""Backend-owned local transcription websocket route."""

import asyncio
import contextlib
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from backend.src.agent.session.manager import SessionManager
from backend.src.api.deps import get_session_manager
from backend.src.api.services.transcription.audio_frames import (
    parse_gateway_audio_frame,
)
from backend.src.api.services.transcription.factory import (
    create_transcription_provider_session,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _trace_payload(
    *,
    trace_id: str,
    path: str,
    stage: str,
    status: str,
    data: dict[str, object] | None = None,
    error: Exception | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "traceId": trace_id,
        "spanId": f"span_{uuid4().hex}",
        "parentSpanId": None,
        "path": path,
        "stage": stage,
        "status": status,
        "runtime": "backend",
        "endedAt": _now_iso(),
    }
    if data is not None:
        payload["data"] = data
    if error is not None:
        payload["error"] = {
            "code": error.__class__.__name__ or "Error",
            "message": str(error)[:240] or "Unknown transcription error",
        }
    return payload


@router.websocket("/ws/transcription")
async def transcription_websocket_endpoint(
    websocket: WebSocket,
    session_manager: SessionManager = Depends(get_session_manager),
) -> None:
    """Expose a single local STT websocket protocol regardless of provider."""
    await websocket.accept()

    send_lock = asyncio.Lock()
    provider_session = create_transcription_provider_session(session_manager.config)
    receive_task: asyncio.Task | None = None
    provider_stream_task: asyncio.Task | None = None
    trace_id = f"trace_{uuid4().hex}"

    async def send_event(payload: dict[str, object]) -> None:
        async with send_lock:
            await websocket.send_json(payload)

    async def send_trace(
        *,
        stage: str,
        status: str,
        data: dict[str, object] | None = None,
        error: Exception | None = None,
    ) -> None:
        await send_event(
            {
                "type": "trace-event",
                "payload": _trace_payload(
                    trace_id=trace_id,
                    path="voice.transcription",
                    stage=stage,
                    status=status,
                    data=data,
                    error=error,
                ),
            }
        )

    try:
        await send_event({"type": "status", "client_id": uuid4().hex})
        await send_trace(
            stage="session",
            status="started",
            data={
                "providerSession": provider_session.__class__.__name__,
            },
        )
        await provider_session.connect()
        await send_trace(
            stage="provider_connect",
            status="succeeded",
            data={
                "providerSession": provider_session.__class__.__name__,
            },
        )
        provider_stream_task = asyncio.create_task(
            provider_session.stream_events(send_event)
        )
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
                        await send_trace(
                            stage="control",
                            status="succeeded",
                            data={
                                "messageType": (
                                    control_message.get("type")
                                    if isinstance(control_message.get("type"), str)
                                    else None
                                ),
                                "payloadKeyCount": len(control_message),
                            },
                        )
            elif binary_payload is not None:
                try:
                    sample_rate, audio_bytes = parse_gateway_audio_frame(binary_payload)
                except ValueError as exc:
                    logger.warning(
                        "Ignoring invalid transcription audio frame: %s", exc
                    )
                    await send_trace(
                        stage="audio_frame",
                        status="failed",
                        data={
                            "rawByteLength": len(binary_payload),
                        },
                        error=exc,
                    )
                else:
                    await provider_session.handle_audio_chunk(audio_bytes, sample_rate)
                    await send_trace(
                        stage="audio_frame",
                        status="succeeded",
                        data={
                            "sampleRate": sample_rate,
                            "byteLength": len(audio_bytes),
                        },
                    )

            receive_task = asyncio.create_task(websocket.receive())

    except WebSocketDisconnect:
        logger.info("Transcription websocket disconnected")
    except Exception as exc:
        logger.error("Transcription websocket failed: %s", exc, exc_info=True)
        try:
            await send_trace(stage="session", status="failed", error=exc)
            await send_event({"type": "error", "message": str(exc)})
        except Exception:
            logger.debug("Failed to send transcription error event", exc_info=True)
    finally:
        if receive_task is not None:
            if not receive_task.done():
                receive_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await receive_task
        if provider_stream_task is not None and not provider_stream_task.done():
            provider_stream_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await provider_stream_task
        await provider_session.close()
        with contextlib.suppress(Exception):
            await websocket.close()
