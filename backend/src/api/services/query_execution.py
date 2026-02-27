"""Query execution service used by the WebSocket query handler."""

from __future__ import annotations

import logging
import time
import asyncio
from typing import TYPE_CHECKING, Any, List, Optional, Type, Union

from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.processing.pipeline import StreamPipeline
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.processing.tts.processor import TTSProcessor
from backend.src.api.schema import QueryMessage
from backend.src.api.services.query_event_extraction import (
    extract_assistant_full_text,
    extract_chunk_text,
    extract_dict_payload,
    extract_dict_string_field,
    extract_event_type,
    extract_non_empty_chunk_text,
    extract_streaming_complete_text,
    resolve_completion_text,
)
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
        self._apply_query_runtime_system_state(agent_instance, message)
        stream_context = self._build_stream_context(
            agent_instance=agent_instance,
            msg_id=msg_id,
            conversation_ref=message.payload.conversation_ref,
        )
        saw_terminal_event = False
        saw_text_chunk = False
        text_chunks: list[str] = []
        last_assistant_full_text: str = ""

        try:
            async with TTSSession(
                self._tts_manager,
                agent_instance.cfg,
                websocket,
                msg_id,
            ) as tts_session:
                transport = transport_sender_cls(websocket)
                tts_processor = tts_processor_cls(self._tts_manager)
                pipeline = pipeline_cls(tts_processor, self._response_formatter, transport)

                resolved_screenshots = self._resolve_screenshots(message, artifact_store_cls)
                image_data: Optional[Union[str, List[str]]] = None
                if resolved_screenshots:
                    image_data = (
                        resolved_screenshots[0]
                        if len(resolved_screenshots) == 1
                        else resolved_screenshots
                    )

                async for event in agent_instance.process_query(
                    query_text,
                    image_data=image_data,
                    message_content=message.payload.content,
                    conversation_ref=message.payload.conversation_ref,
                ):
                    event_type = self._extract_event_type(event)

                    chunk_text = self._extract_non_empty_chunk_text(
                        event,
                        event_type=event_type,
                    )
                    if chunk_text:
                        saw_text_chunk = True
                        text_chunks.append(chunk_text)

                    assistant_full_text = self._extract_assistant_full_text(
                        event,
                        event_type=event_type,
                    )
                    if assistant_full_text:
                        last_assistant_full_text = assistant_full_text

                    if event_type == "streaming-complete":
                        saw_terminal_event = True
                        completion_text = self._resolve_completion_text(
                            event=event,
                            event_type=event_type,
                            text_chunks=text_chunks,
                            assistant_full_text=last_assistant_full_text,
                            saw_text_chunk=saw_text_chunk,
                        )
                        saw_text_chunk = await self._emit_completion_events(
                            pipeline=pipeline,
                            tts_service=tts_session.service,
                            msg_id=msg_id,
                            stream_context=stream_context,
                            completion_text=completion_text,
                            saw_text_chunk=saw_text_chunk,
                        )
                        continue

                    if event_type == "error":
                        saw_terminal_event = True

                    await self._process_pipeline_event(
                        pipeline=pipeline,
                        event=event,
                        tts_service=tts_session.service,
                        msg_id=msg_id,
                        stream_context=stream_context,
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
                    saw_text_chunk = await self._emit_completion_events(
                        pipeline=pipeline,
                        tts_service=tts_session.service,
                        msg_id=msg_id,
                        stream_context=stream_context,
                        completion_text=completion_text,
                        saw_text_chunk=saw_text_chunk,
                    )

                if tts_session.service:
                    await pipeline.wait_for_pending_tts()
                    await tts_session.service.flush()
        except asyncio.CancelledError:
            self._finalize_pending_tool_calls_on_cancel(
                agent_instance=agent_instance,
                msg_id=msg_id,
                conversation_ref=message.payload.conversation_ref,
            )
            raise

        query_total_time = time.perf_counter() - query_start_time
        logger.info(
            "[Timing] Query processing completed in %.3fs (user_id=%s)",
            query_total_time,
            user_id,
        )

    @staticmethod
    def _finalize_pending_tool_calls_on_cancel(
        *,
        agent_instance: Any,
        msg_id: str,
        conversation_ref: Optional[str],
    ) -> None:
        """
        Best-effort reconciliation for cancelled turns with pending tool_call ids.
        """
        history = getattr(agent_instance, "history", None)
        finalize = getattr(history, "finalize_pending_tool_calls_as_cancelled", None)
        if not callable(finalize):
            return
        try:
            reconciled_count = int(finalize() or 0)
        except Exception as exc:
            logger.warning(
                "[Query Cancelled] Failed to reconcile pending tool calls "
                "(user_id=%s, session_id=%s, turn_ref=%s, conversation_ref=%s): %s",
                getattr(agent_instance, "user_id", "unknown"),
                getattr(agent_instance, "session_id", "unknown"),
                msg_id,
                conversation_ref,
                exc,
            )
            return
        if reconciled_count > 0:
            logger.info(
                "[Query Cancelled] Reconciled %s pending tool call(s) with synthetic "
                "tool outputs (user_id=%s, session_id=%s, turn_ref=%s, conversation_ref=%s)",
                reconciled_count,
                getattr(agent_instance, "user_id", "unknown"),
                getattr(agent_instance, "session_id", "unknown"),
                msg_id,
                conversation_ref,
            )

    def _resolve_screenshot(
        self,
        message: QueryMessage,
        artifact_store_cls: Type[ArtifactStore],
    ) -> Optional[str]:
        """Resolve screenshot from inline payload or artifact reference."""
        screenshots = self._resolve_screenshots(message, artifact_store_cls)
        return screenshots[0] if screenshots else None

    def _resolve_screenshots(
        self,
        message: QueryMessage,
        artifact_store_cls: Type[ArtifactStore],
    ) -> Optional[List[str]]:
        """Resolve screenshots from inline payload and/or artifact references."""
        screenshot = message.payload.screenshot
        normalized_inline_screenshot = (
            screenshot.strip() if isinstance(screenshot, str) else None
        )
        screenshot_ref = message.payload.screenshot_ref
        normalized_single_ref = (
            screenshot_ref.strip() if isinstance(screenshot_ref, str) else None
        )
        screenshot_refs = (
            message.payload.screenshot_refs
            if isinstance(message.payload.screenshot_refs, list)
            else None
        )

        if normalized_inline_screenshot:
            return [normalized_inline_screenshot]

        refs_to_resolve = [
            normalized_ref
            for normalized_ref in (
                ref.strip() if isinstance(ref, str) else None
                for ref in (
                    screenshot_refs
                    or ([normalized_single_ref] if normalized_single_ref else [])
                )
            )
            if normalized_ref
        ]
        if not refs_to_resolve:
            return None

        resolved_screenshots: List[str] = []
        try:
            store = artifact_store_cls.from_config(self._session_manager.config)
        except Exception as e:
            logger.warning("Failed to initialize artifact store for screenshots %s: %s", refs_to_resolve, e)
            return None

        for ref in refs_to_resolve:
            try:
                resolved_screenshots.append(store.load_base64(ref))
            except Exception as e:
                logger.warning("Failed to load screenshot artifact %s: %s", ref, e)

        return resolved_screenshots or None

    @staticmethod
    def _resolve_query_runtime_system_state(message: QueryMessage) -> Optional[dict[str, str]]:
        """Extract backend-only runtime state (not model-facing prompt content)."""
        payload_state = getattr(message.payload, "system_state_internal", None)
        if not isinstance(payload_state, dict):
            return None

        runtime_state: dict[str, str] = {}
        for key in ("active_window", "mouse_position", "screen_resolution"):
            value = payload_state.get(key)
            if isinstance(value, str) and value.strip():
                runtime_state[key] = value.strip()

        return runtime_state or None

    def _apply_query_runtime_system_state(self, agent_instance: Any, message: QueryMessage) -> None:
        """Best-effort seed of session runtime state before tool preparation."""
        runtime_state = self._resolve_query_runtime_system_state(message)
        if not runtime_state:
            return

        setter = getattr(agent_instance, "set_current_system_state", None)
        if not callable(setter):
            return

        getter = getattr(agent_instance, "get_current_system_state", None)
        existing_state = getter() if callable(getter) else None
        merged_state: dict[str, str] = {}
        if isinstance(existing_state, dict):
            for key in ("active_window", "mouse_position", "screen_resolution"):
                value = existing_state.get(key)
                if isinstance(value, str) and value.strip():
                    merged_state[key] = value.strip()
        merged_state.update(runtime_state)

        try:
            setter(merged_state)
        except Exception as exc:
            logger.warning("Failed to apply query runtime system state: %s", exc)

    @staticmethod
    def _build_stream_context(
        *,
        agent_instance: Any,
        msg_id: str,
        conversation_ref: Optional[str],
    ) -> dict[str, Optional[str]]:
        """
        Build immutable-per-query stream context once and reuse it across events.

        Reduces per-event dictionary allocations on the hot query streaming path.
        """
        return {
            "user_id": agent_instance.user_id,
            "session_id": agent_instance.session_id,
            "conversation_ref": conversation_ref,
            "turn_ref": msg_id,
        }

    @staticmethod
    async def _process_pipeline_event(
        *,
        pipeline: StreamPipeline,
        event: Any,
        tts_service: Any,
        msg_id: str,
        stream_context: dict[str, Optional[str]],
    ) -> None:
        """Forward one event through pipeline with prebuilt stream context."""
        await pipeline.process(
            event,
            tts_service,
            msg_id,
            context=stream_context,
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
        """
        Emit optional backfill chunk + terminal completion event using shared context.

        Returns:
            Updated saw_text_chunk flag.
        """
        if not saw_text_chunk and completion_text:
            await self._process_pipeline_event(
                pipeline=pipeline,
                event=ChunkEvent(content=completion_text),
                tts_service=tts_service,
                msg_id=msg_id,
                stream_context=stream_context,
            )
            saw_text_chunk = True

        await self._process_pipeline_event(
            pipeline=pipeline,
            event=StreamingCompleteEvent(final_response=completion_text),
            tts_service=tts_service,
            msg_id=msg_id,
            stream_context=stream_context,
        )
        return saw_text_chunk

    @staticmethod
    def _extract_event_type(event: Any) -> Optional[str]:
        return extract_event_type(event)

    @staticmethod
    def _extract_dict_payload(event: Any) -> Optional[dict[str, Any]]:
        return extract_dict_payload(event)

    @classmethod
    def _extract_dict_string_field(
        cls,
        event: Any,
        *,
        top_level_key: str,
        payload_key: Optional[str] = None,
    ) -> Optional[str]:
        _ = cls  # compatibility wrapper
        return extract_dict_string_field(
            event,
            top_level_key=top_level_key,
            payload_key=payload_key,
        )

    @classmethod
    def _extract_non_empty_chunk_text(
        cls,
        event: Any,
        *,
        event_type: Optional[str] = None,
    ) -> str:
        _ = cls  # compatibility wrapper
        return extract_non_empty_chunk_text(
            event,
            event_type=event_type,
        )

    @classmethod
    def _extract_chunk_text(cls, event: Any) -> Optional[str]:
        _ = cls  # compatibility wrapper
        return extract_chunk_text(event)

    @classmethod
    def _extract_assistant_full_text(
        cls,
        event: Any,
        *,
        event_type: Optional[str] = None,
    ) -> str:
        _ = cls  # compatibility wrapper
        return extract_assistant_full_text(
            event,
            event_type=event_type,
        )

    @classmethod
    def _extract_streaming_complete_text(
        cls,
        event: Any,
        *,
        event_type: Optional[str] = None,
    ) -> str:
        _ = cls  # compatibility wrapper
        return extract_streaming_complete_text(
            event,
            event_type=event_type,
        )

    @classmethod
    def _resolve_completion_text(
        cls,
        *,
        event: Any,
        event_type: Optional[str] = None,
        text_chunks: list[str],
        assistant_full_text: str,
        saw_text_chunk: bool,
    ) -> str:
        _ = cls  # compatibility wrapper
        return resolve_completion_text(
            event=event,
            event_type=event_type,
            text_chunks=text_chunks,
            assistant_full_text=assistant_full_text,
            saw_text_chunk=saw_text_chunk,
            empty_fallback=EMPTY_FINAL_RESPONSE_FALLBACK,
        )
