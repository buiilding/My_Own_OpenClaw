"""Query execution service used by the WebSocket query handler."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any, Optional, Type

from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.processing.pipeline import StreamPipeline
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.processing.tts.processor import TTSProcessor
from backend.src.api.schema import QueryMessage
from backend.src.api.services.tts_session import TTSSession
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.transport.sender import WebSocketTransportSender
from backend.src.core.validation.validators import validate_query_text
from backend.src.core.events.streaming_events import ChunkEvent, StreamingCompleteEvent
from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)
EMPTY_FINAL_RESPONSE_FALLBACK = (
    "I completed the requested action(s), but the model returned an empty final response."
)


class QueryExecutionService:
    """Encapsulates query orchestration previously embedded in the handler."""

    def __init__(
        self,
        session_manager: "SessionManager",
        tts_manager: TTSManager,
        response_formatter: ResponseFormatter,
    ) -> None:
        self._session_manager = session_manager
        self._tts_manager = tts_manager
        self._response_formatter = response_formatter

    async def execute(
        self,
        message: QueryMessage,
        websocket: WebSocketSender,
        user_id: str,
        *,
        pipeline_cls: Type[StreamPipeline] = StreamPipeline,
        artifact_store_cls: Type[ArtifactStore] = ArtifactStore,
        transport_sender_cls: Type[WebSocketTransportSender] = WebSocketTransportSender,
        tts_processor_cls: Type[TTSProcessor] = TTSProcessor,
    ) -> None:
        """Execute a validated query through the agent stream pipeline."""
        query_start_time = time.perf_counter()
        msg_id = message.id

        query_text = validate_query_text(message.payload.text)
        agent_instance = await self._session_manager.get_or_create_session(user_id)
        saw_terminal_event = False
        saw_text_chunk = False
        text_chunks: list[str] = []
        last_assistant_full_text: str = ""

        async with TTSSession(
            self._tts_manager,
            agent_instance.cfg,
            websocket,
            msg_id,
        ) as tts_session:
            transport = transport_sender_cls(websocket)
            tts_processor = tts_processor_cls(self._tts_manager)
            pipeline = pipeline_cls(tts_processor, self._response_formatter, transport)

            screenshot = self._resolve_screenshot(message, artifact_store_cls)

            async for event in agent_instance.process_query(
                query_text,
                image_data=screenshot,
                message_content=message.payload.content,
                conversation_ref=message.payload.conversation_ref,
            ):
                if self._is_non_empty_text_chunk(event):
                    saw_text_chunk = True
                    chunk_text = self._extract_chunk_text(event)
                    if chunk_text:
                        text_chunks.append(chunk_text)

                assistant_full_text = self._extract_assistant_full_text(event)
                if assistant_full_text:
                    last_assistant_full_text = assistant_full_text

                if self._is_streaming_complete_event(event):
                    saw_terminal_event = True
                    completion_text = self._resolve_completion_text(
                        event=event,
                        text_chunks=text_chunks,
                        assistant_full_text=last_assistant_full_text,
                        saw_text_chunk=saw_text_chunk,
                    )
                    if not saw_text_chunk and completion_text:
                        await pipeline.process(
                            ChunkEvent(content=completion_text),
                            tts_session.service,
                            msg_id,
                            context={
                                "user_id": agent_instance.user_id,
                                "session_id": agent_instance.session_id,
                                "conversation_ref": message.payload.conversation_ref,
                                "turn_ref": msg_id,
                            },
                        )
                        saw_text_chunk = True

                    await pipeline.process(
                        StreamingCompleteEvent(final_response=completion_text),
                        tts_session.service,
                        msg_id,
                        context={
                            "user_id": agent_instance.user_id,
                            "session_id": agent_instance.session_id,
                            "conversation_ref": message.payload.conversation_ref,
                            "turn_ref": msg_id,
                        },
                    )
                    continue

                if self._is_error_event(event):
                    saw_terminal_event = True

                await pipeline.process(
                    event,
                    tts_session.service,
                    msg_id,
                    context={
                        "user_id": agent_instance.user_id,
                        "session_id": agent_instance.session_id,
                        "conversation_ref": message.payload.conversation_ref,
                        "turn_ref": msg_id,
                    },
                )

            if not saw_terminal_event:
                logger.warning(
                    "Agent stream ended without terminal event; emitting fallback completion "
                    "(user_id=%s, turn_ref=%s)",
                    agent_instance.user_id,
                    msg_id,
                )
                completion_text = self._resolve_completion_text(
                    event=None,
                    text_chunks=text_chunks,
                    assistant_full_text=last_assistant_full_text,
                    saw_text_chunk=saw_text_chunk,
                )
                if not saw_text_chunk:
                    await pipeline.process(
                        ChunkEvent(content=completion_text),
                        tts_session.service,
                        msg_id,
                        context={
                            "user_id": agent_instance.user_id,
                            "session_id": agent_instance.session_id,
                            "conversation_ref": message.payload.conversation_ref,
                            "turn_ref": msg_id,
                        },
                    )
                await pipeline.process(
                    StreamingCompleteEvent(final_response=completion_text),
                    tts_session.service,
                    msg_id,
                    context={
                        "user_id": agent_instance.user_id,
                        "session_id": agent_instance.session_id,
                        "conversation_ref": message.payload.conversation_ref,
                        "turn_ref": msg_id,
                    },
                )

            if tts_session.service:
                await pipeline.wait_for_pending_tts()
                await tts_session.service.flush()

        query_total_time = time.perf_counter() - query_start_time
        logger.info(
            "[Timing] Query processing completed in %.3fs (user_id=%s)",
            query_total_time,
            user_id,
        )

    def _resolve_screenshot(
        self,
        message: QueryMessage,
        artifact_store_cls: Type[ArtifactStore],
    ) -> Optional[str]:
        """Resolve screenshot from inline payload or artifact reference."""
        screenshot = message.payload.screenshot
        screenshot_ref = message.payload.screenshot_ref

        if screenshot or not screenshot_ref:
            return screenshot

        try:
            store = artifact_store_cls.from_config(self._session_manager.config)
            return store.load_base64(screenshot_ref)
        except Exception as e:
            logger.warning("Failed to load screenshot artifact %s: %s", screenshot_ref, e)
            return None

    @staticmethod
    def _extract_event_type(event: Any) -> Optional[str]:
        if isinstance(event, dict):
            value = event.get("type")
            return str(value) if isinstance(value, str) else None

        event_type = getattr(event, "type", None)
        if isinstance(event_type, str):
            return event_type
        value = getattr(event_type, "value", None)
        return str(value) if isinstance(value, str) else None

    @classmethod
    def _is_terminal_event(cls, event: Any) -> bool:
        event_type = cls._extract_event_type(event)
        return event_type in {"streaming-complete", "error"}

    @classmethod
    def _is_streaming_complete_event(cls, event: Any) -> bool:
        return cls._extract_event_type(event) == "streaming-complete"

    @classmethod
    def _is_error_event(cls, event: Any) -> bool:
        return cls._extract_event_type(event) == "error"

    @classmethod
    def _is_non_empty_text_chunk(cls, event: Any) -> bool:
        event_type = cls._extract_event_type(event)
        if event_type not in {"chunk", "content", "streaming-response"}:
            return False

        content = cls._extract_chunk_text(event)
        return isinstance(content, str) and bool(content.strip())

    @staticmethod
    def _extract_chunk_text(event: Any) -> Optional[str]:
        if isinstance(event, dict):
            content = event.get("content")
            if not content and isinstance(event.get("payload"), dict):
                content = event["payload"].get("text")
            return content if isinstance(content, str) else None

        content = getattr(event, "content", None)
        return content if isinstance(content, str) else None

    @classmethod
    def _extract_assistant_full_text(cls, event: Any) -> str:
        if cls._extract_event_type(event) != "assistant_message_full":
            return ""
        if isinstance(event, dict):
            content = event.get("content")
            if not content and isinstance(event.get("payload"), dict):
                content = event["payload"].get("content")
            return content.strip() if isinstance(content, str) else ""
        content = getattr(event, "content", None)
        return content.strip() if isinstance(content, str) else ""

    @classmethod
    def _extract_streaming_complete_text(cls, event: Any) -> str:
        if not event:
            return ""
        if cls._extract_event_type(event) != "streaming-complete":
            return ""
        if isinstance(event, dict):
            payload = event.get("payload")
            if isinstance(payload, dict):
                final_response = payload.get("final_response")
                if isinstance(final_response, str):
                    return final_response.strip()
            return ""
        final_response = getattr(event, "final_response", None)
        return final_response.strip() if isinstance(final_response, str) else ""

    @classmethod
    def _resolve_completion_text(
        cls,
        *,
        event: Any,
        text_chunks: list[str],
        assistant_full_text: str,
        saw_text_chunk: bool,
    ) -> str:
        event_completion_text = cls._extract_streaming_complete_text(event)
        if event_completion_text:
            return event_completion_text
        if saw_text_chunk:
            combined = "".join(text_chunks).strip()
            if combined:
                return combined
        if assistant_full_text:
            return assistant_full_text
        return EMPTY_FINAL_RESPONSE_FALLBACK
