"""Query execution service used by the WebSocket query handler."""

from __future__ import annotations

import logging
import time
import asyncio
import inspect
from typing import TYPE_CHECKING, Any, Optional, Type

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.processing.pipeline import StreamPipeline
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.processing.tts.processor import TTSProcessor
from backend.src.api.schemas import QueryMessage
from backend.src.api.services.query_event_extraction import (
    extract_assistant_full_text,
    extract_event_type,
    extract_non_empty_chunk_text,
)
from backend.src.api.services.query_execution_support.query_execution_completion import (
    complete_query_stream,
)
from backend.src.api.services.query_execution_support.query_execution_cancellation import (
    finalize_pending_tool_calls_on_cancel,
)
from backend.src.api.services.query_execution_support.query_execution_inputs import (
    resolve_query_execution_inputs,
)
from backend.src.api.services.query_execution_support.query_execution_pipeline_events import (
    emit_completion_events,
    process_pipeline_event,
)
from backend.src.api.services.query_execution_support.query_execution_runtime import (
    build_stream_context,
)
from backend.src.api.services.query_execution_support.query_execution_stream_state import (
    QueryExecutionStreamState,
)
from backend.src.api.services.query_execution_support.query_execution_terminal_policy import (
    is_post_terminal_event_allowed,
)
from backend.src.api.services.tts_session import TTSSession
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.transport.envelope import build_transport_message
from backend.src.api.transport.sender import WebSocketTransportSender
from backend.src.core.validation.validators import validate_query_text
from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.agent.session.manager import SessionManager

logger = logging.getLogger(__name__)
EMPTY_FINAL_RESPONSE_FALLBACK = "I completed the requested action(s), but the model returned an empty final response."


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
        agent_instance = await self._session_manager.get_or_create_session(
            user_id,
            conversation_ref=message.payload.conversation_ref,
        )
        frontend_operating_system = self._get_frontend_operating_system(user_id)
        stream_context = self._build_stream_context(
            agent_instance=agent_instance,
            msg_id=msg_id,
            conversation_ref=message.payload.conversation_ref,
        )
        self._set_active_stream_context(
            agent_instance=agent_instance,
            msg_id=msg_id,
            conversation_ref=message.payload.conversation_ref,
        )
        try:
            await websocket.send_json(
                build_transport_message(
                    OutgoingMessageType.QUERY_ACCEPTED,
                    msg_id,
                    {"status": "accepted"},
                    context=stream_context,
                )
            )
            stream_state = QueryExecutionStreamState()

            async with TTSSession(
                self._tts_manager,
                agent_instance.cfg,
                websocket,
                msg_id,
            ) as tts_session:
                transport = transport_sender_cls(websocket)
                tts_processor = tts_processor_cls(self._tts_manager)
                pipeline = pipeline_cls(
                    tts_processor, self._response_formatter, transport
                )

                query_inputs = resolve_query_execution_inputs(
                    message,
                    artifact_store_cls=artifact_store_cls,
                    session_manager_config=getattr(
                        self._session_manager, "config", None
                    ),
                    user_id=user_id,
                )

                async for event in agent_instance.process_query(
                    query_text,
                    image_data=query_inputs.image_data,
                    capture_meta=query_inputs.capture_meta,
                    message_content=query_inputs.message_content,
                    conversation_ref=query_inputs.conversation_ref,
                    operating_system=frontend_operating_system,
                    workspace_path=query_inputs.workspace_path,
                    repo_instruction_messages=query_inputs.repo_instruction_messages,
                    client_prompt_layers=query_inputs.client_prompt_layers,
                    agent_definition=query_inputs.agent_definition,
                    runtime_system_state=query_inputs.runtime_system_state,
                ):
                    event_type = extract_event_type(event)

                    if stream_state.saw_terminal_event:
                        if is_post_terminal_event_allowed(event_type):
                            await self._process_pipeline_event(
                                pipeline=pipeline,
                                event=event,
                                tts_service=tts_session.service,
                                msg_id=msg_id,
                                stream_context=stream_context,
                            )
                            continue
                        logger.debug(
                            "Ignoring post-terminal stream event "
                            "(user_id=%s, turn_ref=%s, event_type=%s)",
                            agent_instance.user_id,
                            msg_id,
                            event_type,
                        )
                        continue

                    chunk_text = extract_non_empty_chunk_text(
                        event,
                        event_type=event_type,
                    )
                    assistant_full_text = extract_assistant_full_text(
                        event,
                        event_type=event_type,
                    )
                    stream_state.observe_texts(
                        chunk_text=chunk_text,
                        assistant_full_text=assistant_full_text,
                    )

                    if event_type == "streaming-complete":
                        stream_state.saw_text_chunk = await complete_query_stream(
                            pipeline=pipeline,
                            tts_service=tts_session.service,
                            msg_id=msg_id,
                            stream_context=stream_context,
                            stream_state=stream_state,
                            event=event,
                            event_type=event_type,
                            empty_fallback=EMPTY_FINAL_RESPONSE_FALLBACK,
                        )
                        continue

                    if event_type == "error":
                        stream_state.mark_terminal()

                    await self._process_pipeline_event(
                        pipeline=pipeline,
                        event=event,
                        tts_service=tts_session.service,
                        msg_id=msg_id,
                        stream_context=stream_context,
                    )

                if not stream_state.saw_terminal_event:
                    logger.warning(
                        "Agent stream ended without terminal event; emitting fallback completion "
                        "(user_id=%s, turn_ref=%s)",
                        agent_instance.user_id,
                        msg_id,
                    )
                    stream_state.saw_text_chunk = await complete_query_stream(
                        pipeline=pipeline,
                        tts_service=tts_session.service,
                        msg_id=msg_id,
                        stream_context=stream_context,
                        stream_state=stream_state,
                        event=None,
                        event_type=None,
                        empty_fallback=EMPTY_FINAL_RESPONSE_FALLBACK,
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
        except asyncio.CancelledError:
            self._finalize_pending_tool_calls_on_cancel(
                agent_instance=agent_instance,
                msg_id=msg_id,
                conversation_ref=message.payload.conversation_ref,
            )
            raise
        finally:
            self._clear_active_stream_context(
                agent_instance=agent_instance,
                msg_id=msg_id,
            )

    @staticmethod
    def _finalize_pending_tool_calls_on_cancel(
        *,
        agent_instance: Any,
        msg_id: str,
        conversation_ref: Optional[str],
    ) -> None:
        finalize_pending_tool_calls_on_cancel(
            agent_instance=agent_instance,
            msg_id=msg_id,
            conversation_ref=conversation_ref,
        )

    @staticmethod
    def _build_stream_context(
        *,
        agent_instance: Any,
        msg_id: str,
        conversation_ref: Optional[str],
    ) -> dict[str, Optional[str]]:
        return build_stream_context(
            agent_instance=agent_instance,
            msg_id=msg_id,
            conversation_ref=conversation_ref,
        )

    @staticmethod
    def _set_active_stream_context(
        *,
        agent_instance: Any,
        msg_id: str,
        conversation_ref: Optional[str],
    ) -> None:
        setter = getattr(agent_instance, "set_active_stream_context", None)
        if callable(setter):
            setter(turn_ref=msg_id, conversation_ref=conversation_ref)

    @staticmethod
    def _clear_active_stream_context(
        *,
        agent_instance: Any,
        msg_id: str,
    ) -> None:
        clearer = getattr(agent_instance, "clear_active_stream_context", None)
        if callable(clearer):
            clearer(turn_ref=msg_id)

    def _get_frontend_operating_system(self, user_id: str) -> Optional[str]:
        get_frontend_operating_system = getattr(
            self._session_manager,
            "get_frontend_operating_system",
            None,
        )
        if not callable(get_frontend_operating_system):
            return None
        try:
            signature = inspect.signature(get_frontend_operating_system)
        except (TypeError, ValueError):
            signature = None

        positional_params = [
            parameter
            for parameter in (signature.parameters.values() if signature else [])
            if parameter.kind
            in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
        ]
        has_varargs = any(
            parameter.kind == inspect.Parameter.VAR_POSITIONAL
            for parameter in (signature.parameters.values() if signature else [])
        )
        if signature is None or has_varargs or len(positional_params) >= 1:
            operating_system = get_frontend_operating_system(user_id)
        else:
            operating_system = get_frontend_operating_system()
        return operating_system if isinstance(operating_system, str) else None

    @staticmethod
    async def _process_pipeline_event(
        *,
        pipeline: StreamPipeline,
        event: Any,
        tts_service: Any,
        msg_id: str,
        stream_context: dict[str, Optional[str]],
    ) -> None:
        await process_pipeline_event(
            pipeline=pipeline,
            event=event,
            tts_service=tts_service,
            msg_id=msg_id,
            stream_context=stream_context,
        )

    async def _emit_completion_events(
        self,
        *,
        pipeline: StreamPipeline,
        tts_service: Any,
        msg_id: str,
        stream_context: dict[str, Optional[str]],
        completion_text: str,
        saw_text_chunk: bool,
    ) -> bool:
        return await emit_completion_events(
            pipeline=pipeline,
            tts_service=tts_service,
            msg_id=msg_id,
            stream_context=stream_context,
            completion_text=completion_text,
            saw_text_chunk=saw_text_chunk,
        )
