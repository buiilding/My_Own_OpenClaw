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
from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)


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
            ):
                await pipeline.process(
                    event,
                    tts_session.service,
                    msg_id,
                    context={
                        "user_id": agent_instance.user_id,
                        "session_id": agent_instance.session_id,
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
