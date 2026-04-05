"""OpenAI Realtime-backed transcription provider mapped to the WindieOS gateway."""

from __future__ import annotations

from collections import defaultdict
import json
import logging
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

from backend.src.api.services.transcription.audio_frames import (
    encode_audio_base64,
    resample_pcm16_mono,
)
from backend.src.api.services.transcription.protocol import (
    GatewayEventSender,
    TranscriptionProviderSession,
)
from backend.src.api.services.transcription.provider_helpers import resolve_openai_api_key
from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)

OPENAI_INPUT_SAMPLE_RATE = 24000
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"


class OpenAIRealtimeTranscriptionSession(TranscriptionProviderSession):
    """Translate OpenAI Realtime transcription events to the local gateway contract."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._connection: Any | None = None
        self._language = config.stt_language
        self._partial_transcripts: dict[str, str] = defaultdict(str)

    async def connect(self) -> None:
        api_key = resolve_openai_api_key(self._config)
        if not api_key:
            raise RuntimeError(
                "OpenAI STT provider is selected but no OpenAI API key is available."
            )

        self._connection = await websockets.connect(
            self._build_url(),
            extra_headers={
                "Authorization": f"Bearer {api_key}",
            },
        )
        await self._apply_session_update()

    async def handle_control_message(self, message: dict[str, object]) -> None:
        message_type = str(message.get("type") or "").strip()
        if message_type == "set_langs":
            next_language = str(message.get("source_language") or "").strip()
            if next_language and next_language != self._language:
                self._language = next_language
                await self._apply_session_update()
            return

        if message_type == "start_over":
            self._partial_transcripts.clear()
            await self._send_json({"type": "input_audio_buffer.clear"})

    async def handle_audio_chunk(self, audio_bytes: bytes, sample_rate: int) -> None:
        normalized_audio = resample_pcm16_mono(
            audio_bytes,
            src_rate=sample_rate,
            dst_rate=OPENAI_INPUT_SAMPLE_RATE,
        )
        if not normalized_audio:
            return
        await self._send_json(
            {
                "type": "input_audio_buffer.append",
                "audio": encode_audio_base64(normalized_audio),
            }
        )

    async def stream_events(self, send_event: GatewayEventSender) -> None:
        connection = self._require_connection()
        try:
            async for raw_message in connection:
                if not isinstance(raw_message, str):
                    continue
                try:
                    event = json.loads(raw_message)
                except json.JSONDecodeError:
                    logger.debug("Ignoring non-JSON OpenAI realtime event: %r", raw_message)
                    continue
                if not isinstance(event, dict):
                    continue
                event_type = str(event.get("type") or "")
                if event_type == "error":
                    details = event.get("error")
                    logger.error("OpenAI realtime transcription error event: %s", details)
                    await send_event(
                        {
                            "type": "error",
                            "message": str(details or "OpenAI realtime transcription error"),
                        }
                    )
                    continue
                if event_type == "conversation.item.input_audio_transcription.delta":
                    item_id = str(event.get("item_id") or "")
                    delta = str(event.get("delta") or "")
                    if not item_id or not delta:
                        continue
                    self._partial_transcripts[item_id] = (
                        self._partial_transcripts.get(item_id, "") + delta
                    )
                    await send_event(
                        {
                            "type": "realtime",
                            "text": self._partial_transcripts[item_id],
                            "is_final": False,
                        }
                    )
                    continue

                if event_type == "conversation.item.input_audio_transcription.completed":
                    item_id = str(event.get("item_id") or "")
                    transcript = str(event.get("transcript") or "")
                    if not transcript and item_id:
                        transcript = self._partial_transcripts.get(item_id, "")
                    if item_id:
                        self._partial_transcripts.pop(item_id, None)
                    if transcript:
                        await send_event(
                            {
                                "type": "realtime",
                                "text": transcript,
                                "is_final": True,
                            }
                        )
                    await send_event({"type": "utterance_end"})
                    continue

                if event_type == "conversation.item.input_audio_transcription.failed":
                    details = event.get("error")
                    await send_event(
                        {
                            "type": "error",
                            "message": str(details or "OpenAI transcription failed"),
                        }
                    )
        except ConnectionClosed as exc:
            logger.warning(
                "OpenAI realtime transcription connection closed (code=%s, reason=%s)",
                getattr(exc, "code", "unknown"),
                getattr(exc, "reason", ""),
            )
            return

    async def close(self) -> None:
        connection = self._connection
        self._connection = None
        if connection is not None:
            await connection.close()
        self._partial_transcripts.clear()

    async def _apply_session_update(self) -> None:
        transcription = {
            "model": self._config.openai_realtime_transcription_model,
        }
        if self._language:
            transcription["language"] = self._language

        await self._send_json(
            {
                "type": "session.update",
                "session": {
                    "type": "transcription",
                    "audio": {
                        "input": {
                            "format": {
                                "type": "audio/pcm",
                                "rate": OPENAI_INPUT_SAMPLE_RATE,
                            },
                            "transcription": transcription,
                            "turn_detection": {
                                "type": "server_vad",
                                "create_response": False,
                                "interrupt_response": False,
                                "prefix_padding_ms": self._config.stt_vad_prefix_padding_ms,
                                "silence_duration_ms": self._config.stt_vad_silence_duration_ms,
                                "threshold": self._config.stt_vad_threshold,
                            },
                        }
                    },
                },
            }
        )

    async def _send_json(self, payload: dict[str, Any]) -> None:
        connection = self._require_connection()
        await connection.send(json.dumps(payload))

    def _build_url(self) -> str:
        return f"{OPENAI_REALTIME_URL}?intent=transcription"

    def _require_connection(self) -> Any:
        if self._connection is None:
            raise RuntimeError("OpenAI realtime transcription session is not connected")
        return self._connection
