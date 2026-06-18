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
from backend.src.api.schemas.incoming import QueryMessage
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
    process_pipeline_event,
)
from backend.src.api.services.query_execution_support.query_execution_runtime import (
    build_stream_context,
)
from backend.src.api.services.query_execution_support.query_execution_stream_state import (
    QueryExecutionStreamState,
)
from backend.src.api.services.tts_session import TTSSession
from backend.src.api.transport.protocol import WebSocketSender
from backend.src.api.transport.envelope import build_transport_message
from backend.src.api.transport.sender import WebSocketTransportSender
from backend.src.core.validation.validators import validate_query_text
from backend.src.core.events.streaming_events import TraceEvent
from backend.src.services.artifacts.store import ArtifactStore

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
        client_operating_system = self._get_client_operating_system(user_id)
        stream_context = build_stream_context(
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
                tts_trace_enabled = bool(
                    getattr(agent_instance.cfg, "speech_mode_enabled", False)
                    or getattr(agent_instance.cfg, "tts_enabled", False)
                )
                tts_trace_started_at = time.perf_counter()
                transport = transport_sender_cls(websocket)
                tts_processor = tts_processor_cls(self._tts_manager)
                pipeline = pipeline_cls(
                    tts_processor, self._response_formatter, transport
                )
                if tts_trace_enabled:
                    await process_pipeline_event(
                        pipeline=pipeline,
                        event=TraceEvent(
                            path="tts.playback",
                            stage="session",
                            status="started" if tts_session.service else "skipped",
                            runtime="backend",
                            request_id=msg_id,
                            data={
                                "speechModeEnabled": bool(
                                    getattr(
                                        agent_instance.cfg,
                                        "speech_mode_enabled",
                                        False,
                                    )
                                ),
                                "ttsEnabled": bool(
                                    getattr(agent_instance.cfg, "tts_enabled", False)
                                ),
                                "hasTtsService": tts_session.service is not None,
                                "hasAudioTask": tts_session.audio_task is not None,
                                "provider": str(
                                    getattr(agent_instance.cfg, "speech_provider", "")
                                    or ""
                                ).strip()
                                or None,
                            },
                        ),
                        tts_service=None,
                        msg_id=msg_id,
                        stream_context=stream_context,
                    )
                await process_pipeline_event(
                    pipeline=pipeline,
                    event=TraceEvent(
                        path="backend.stream",
                        stage="stream",
                        status="started",
                        runtime="backend",
                        request_id=msg_id,
                        data={
                            "hasConversationRef": bool(
                                message.payload.conversation_ref
                            ),
                            "hasScreenshotRef": bool(message.payload.screenshot_ref),
                            "screenshotRefCount": len(
                                message.payload.screenshot_refs or []
                            )
                            + (1 if message.payload.screenshot_ref else 0),
                            "hasRuntimeSystemState": bool(
                                message.payload.system_state_internal
                            ),
                        },
                    ),
                    tts_service=None,
                    msg_id=msg_id,
                    stream_context=stream_context,
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
                    image_data=None,
                    image_refs=query_inputs.image_refs,
                    capture_meta=query_inputs.capture_meta,
                    message_content=query_inputs.message_content,
                    conversation_ref=query_inputs.conversation_ref,
                    operating_system=client_operating_system,
                    workspace_path=query_inputs.workspace_path,
                    repo_instruction_messages=query_inputs.repo_instruction_messages,
                    client_prompt_layers=query_inputs.client_prompt_layers,
                    agent_definition=query_inputs.agent_definition,
                    runtime_system_state=query_inputs.runtime_system_state,
                ):
                    event_type = extract_event_type(event)
                    stream_state.observe_event_type(event_type)

                    if stream_state.saw_terminal_event:
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

                    await process_pipeline_event(
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
                    stream_state.mark_fallback_completion_used()

                if tts_session.service:
                    await pipeline.wait_for_pending_tts()
                    await tts_session.service.flush()

                if tts_trace_enabled:
                    await process_pipeline_event(
                        pipeline=pipeline,
                        event=TraceEvent(
                            path="tts.playback",
                            stage="session",
                            status="succeeded" if tts_session.service else "skipped",
                            runtime="backend",
                            request_id=msg_id,
                            duration_ms=round(
                                (time.perf_counter() - tts_trace_started_at) * 1000
                            ),
                            data={
                                "hasTtsService": tts_session.service is not None,
                                "hasAudioTask": tts_session.audio_task is not None,
                                "audioTaskDone": (
                                    bool(tts_session.audio_task.done())
                                    if tts_session.audio_task is not None
                                    else None
                                ),
                            },
                        ),
                        tts_service=None,
                        msg_id=msg_id,
                        stream_context=stream_context,
                    )

                await process_pipeline_event(
                    pipeline=pipeline,
                    event=TraceEvent(
                        path="backend.stream",
                        stage="stream",
                        status="succeeded",
                        runtime="backend",
                        request_id=msg_id,
                        duration_ms=round(
                            (time.perf_counter() - query_start_time) * 1000
                        ),
                        data={
                            "eventCount": stream_state.event_count,
                            "chunkCount": stream_state.chunk_count,
                            "toolCallCount": stream_state.tool_call_count,
                            "toolOutputCount": stream_state.tool_output_count,
                            "sawTerminalEvent": stream_state.saw_terminal_event,
                            "terminalEventType": stream_state.terminal_event_type,
                            "fallbackCompletionUsed": stream_state.fallback_completion_used,
                        },
                    ),
                    tts_service=None,
                    msg_id=msg_id,
                    stream_context=stream_context,
                )

            query_total_time = time.perf_counter() - query_start_time
            logger.info(
                "[Timing] Query processing completed in %.3fs (user_id=%s)",
                query_total_time,
                user_id,
            )
        except asyncio.CancelledError:
            finalize_pending_tool_calls_on_cancel(
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

    def _get_client_operating_system(self, user_id: str) -> Optional[str]:
        get_client_operating_system = getattr(
            self._session_manager,
            "get_client_operating_system",
            None,
        )
        if not callable(get_client_operating_system):
            return None
        try:
            signature = inspect.signature(get_client_operating_system)
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
            operating_system = get_client_operating_system(user_id)
        else:
            operating_system = get_client_operating_system()
        return operating_system if isinstance(operating_system, str) else None

