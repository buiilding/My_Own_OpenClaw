"""
LLM Stream Processor.

Handles LLM streaming, text aggregation, and token counting.
"""

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from backend.src.agent.llm.retry_policy import (
    MAX_PROVIDER_SAMPLING_ATTEMPTS,
    is_downstream_visible_event,
    should_retry_provider_error,
)
from backend.src.agent.llm.stream_processor_helpers import (
    apply_stream_event,
    build_llm_api_error_message,
    derive_prompt_continuity,
    fingerprint_prompt,
    normalize_stream_response_payload,
    resolve_prompt_cache_key_for_provider,
)
from backend.src.agent.llm.token_counting import TokenCounts, count_tokens
from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    TokenCountEvent,
)
from backend.src.core.infrastructure.error_types.llm import (
    LLMAPIError,
    LLMRateLimitError,
)
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.request_kwargs import build_tool_transport_kwargs
from backend.src.services.token_service import get_token_service
from backend.src.tools.web_search.capabilities import (
    should_enable_openai_native_web_search_main_request,
)

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.session.state import ConversationHistory
    from backend.src.llm.client import LLMClient

logger = logging.getLogger(__name__)


class LLMStreamProcessor:
    """
    Processes LLM streaming and token counting.

    Responsibility: LLM streaming, text aggregation, and token counting.
    Yields streaming events directly for real-time updates.
    """

    def __init__(
        self,
        llm_client: "LLMClient",
        session: "AgentSession",
    ):
        """
        Initialize the LLM interaction handler.

        Args:
            llm_client: Client for LLM API calls
            session: Agent session for configuration and history access
        """
        self.llm_client = llm_client
        self.session = session
        self._llm_turn_counter = 0
        self._last_prompt_fingerprints: Optional[List[str]] = None
        self._last_response_payload: Optional[NormalizedLLMResponse] = None
        self._response_lock = asyncio.Lock()

    async def get_response(
        self,
        prompt: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Serialize LLM response processing for this session-scoped processor."""
        async with self._response_lock:
            async for event in self._get_response_unlocked(
                prompt=prompt,
                tools=tools,
                tool_choice=tool_choice,
                parallel_tool_calls=parallel_tool_calls,
            ):
                yield event

    async def _get_response_unlocked(
        self,
        prompt: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Streams LLM response, aggregates text, and counts tokens.

        Yields streaming events (ChunkEvent, ThinkingEvent, ErrorEvent) as they arrive.
        After streaming completes, yields FullResponseEvent and TokenCountEvent.

        Args:
            prompt: List of LLM messages to send to the LLM

        Yields:
            Streaming events: ChunkEvent, ThinkingEvent, ErrorEvent, FullResponseEvent, TokenCountEvent
        """
        model_id = self.session.cfg.selected_model_id
        turn = self._log_prompt_cache_hint(prompt, model_id)
        prompt_cache_key = self._resolve_prompt_cache_key()
        previous_response_id = self._resolve_previous_response_id(
            prompt=prompt,
            tools=tools,
        )
        native_web_search_enabled = (
            True
            if should_enable_openai_native_web_search_main_request(self.session.cfg)
            else None
        )
        request_kwargs = self._build_completion_request_kwargs(
            model_id=model_id,
            prompt=prompt,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
            native_web_search_enabled=native_web_search_enabled,
            previous_response_id=previous_response_id,
        )
        preflight_prompt_tokens = self._count_provider_prompt_tokens_before_request(
            prompt,
            tools=tools,
        )
        use_native_completion = self._should_use_native_completion_path(
            tools,
            model_id,
        )

        for attempt in range(1, MAX_PROVIDER_SAMPLING_ATTEMPTS + 1):
            llm_start_time = time.perf_counter()
            self._last_response_payload = None
            full_text = ""
            output_emitted = False
            retrying_attempt = False
            logger.info(
                "[Timing] LLM request started (session=%s, turn=%s, model=%s, preflight_prompt_tokens=%s, attempt=%s/%s)",
                self.session.session_id,
                turn,
                model_id,
                preflight_prompt_tokens,
                attempt,
                MAX_PROVIDER_SAMPLING_ATTEMPTS,
            )

            try:
                if use_native_completion:
                    response = await self.llm_client.get_completion_response(
                        **request_kwargs
                    )
                    full_text = response.get("content", "")
                    self._last_response_payload = response

                    if full_text:
                        output_emitted = True
                        # Preserve client chunk contract for non-stream path.
                        yield ChunkEvent(content=full_text)

                    self._log_provider_cache_diagnostics(model_id, turn)
                else:
                    first_token_time = None
                    async for event in self._iter_completion_stream(
                        request_kwargs=request_kwargs,
                    ):
                        full_text, event_to_emit = apply_stream_event(event, full_text)
                        if event_to_emit is None:
                            continue

                        if isinstance(event_to_emit, ErrorEvent):
                            error_event = self._with_stream_failure_metadata(
                                event_to_emit,
                                full_text,
                            )
                            retry_decision = should_retry_provider_error(
                                error_event,
                                attempt=attempt,
                                output_emitted=output_emitted,
                            )
                            if retry_decision.should_retry:
                                await self._sleep_before_provider_retry(
                                    error_event=error_event,
                                    retry_reason=retry_decision.reason,
                                    delay_seconds=retry_decision.delay_seconds,
                                    attempt=attempt,
                                )
                                retrying_attempt = True
                                break
                            yield error_event
                            return

                        if first_token_time is None:
                            first_token_time = time.perf_counter()
                            first_token_latency = first_token_time - llm_start_time
                            logger.info(
                                "[Timing] LLM first token received in %.3fs",
                                first_token_latency,
                            )

                        if is_downstream_visible_event(event_to_emit):
                            output_emitted = True
                        yield event_to_emit

                    if retrying_attempt:
                        continue

                    stream_payload_getter = getattr(
                        self.llm_client,
                        "get_last_stream_response_payload",
                        None,
                    )
                    stream_payload = (
                        stream_payload_getter()
                        if callable(stream_payload_getter)
                        else None
                    )
                    self._last_response_payload = normalize_stream_response_payload(
                        stream_payload,
                        full_text,
                    )
                    self._log_provider_cache_diagnostics(model_id, turn)

                yield FullResponseEvent(content=full_text)

                token_counts = await self._count_tokens(prompt, full_text, tools=tools)
                self._record_provider_prompt_tokens_for_compaction(token_counts)
                yield TokenCountEvent(
                    prompt_tokens=token_counts.prompt_tokens,
                    visible_output_tokens=token_counts.visible_output_tokens,
                    thinking_tokens=token_counts.thinking_tokens,
                    output_tokens_total=token_counts.output_tokens_total,
                    total_tokens=token_counts.total_tokens,
                    conversation_tokens=token_counts.conversation_tokens,
                    usage_source=token_counts.usage_source,
                    cached_tokens=token_counts.cached_tokens,
                    cache_hit=token_counts.cache_hit,
                    cache_status=token_counts.cache_status,
                )

                llm_total_time = time.perf_counter() - llm_start_time
                logger.info(
                    "[Timing] LLM response completed in %.3fs (model=%s, tokens=%s, attempt=%s/%s)",
                    llm_total_time,
                    model_id,
                    token_counts.total_tokens,
                    attempt,
                    MAX_PROVIDER_SAMPLING_ATTEMPTS,
                )
                return

            except LLMRateLimitError as e:
                metadata = self._build_stream_failure_metadata(full_text)
                if isinstance(e.metadata, dict):
                    metadata.update(e.metadata)
                yield ErrorEvent(
                    content="Rate limit exceeded. Please wait.",
                    metadata=metadata,
                )
                raise
            except LLMAPIError as e:
                logger.error(f"LLM API error: {e}", exc_info=True)
                metadata = self._build_stream_failure_metadata(full_text)
                if isinstance(e.metadata, dict):
                    metadata.update(e.metadata)
                error_event = ErrorEvent(
                    content=build_llm_api_error_message(e),
                    metadata=metadata,
                )
                retry_decision = should_retry_provider_error(
                    error_event,
                    attempt=attempt,
                    output_emitted=output_emitted,
                )
                if retry_decision.should_retry:
                    await self._sleep_before_provider_retry(
                        error_event=error_event,
                        retry_reason=retry_decision.reason,
                        delay_seconds=retry_decision.delay_seconds,
                        attempt=attempt,
                    )
                    continue
                yield error_event
                raise
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                yield ErrorEvent(
                    content=f"LLM error: {str(e)}",
                    metadata=self._build_stream_failure_metadata(full_text),
                )
                raise

    @staticmethod
    def _build_stream_failure_metadata(full_text: str) -> dict:
        partial_response_emitted = bool(full_text)
        return {
            "stream_failed": True,
            "terminal": True,
            "partial_response_emitted": partial_response_emitted,
            "discard_partial_response": partial_response_emitted,
        }

    @classmethod
    def _with_stream_failure_metadata(
        cls,
        event: ErrorEvent,
        full_text: str,
    ) -> ErrorEvent:
        metadata = cls._build_stream_failure_metadata(full_text)
        if isinstance(event.metadata, dict):
            metadata.update(event.metadata)
        return ErrorEvent(content=event.content, metadata=metadata)

    async def _sleep_before_provider_retry(
        self,
        *,
        error_event: ErrorEvent,
        retry_reason: str,
        delay_seconds: float,
        attempt: int,
    ) -> None:
        metadata = (
            error_event.metadata if isinstance(error_event.metadata, dict) else {}
        )
        logger.warning(
            "[LLM Retry] Reconnecting... %s/%s after transient provider error provider=%s status=%s kind=%s reason=%s delay=%.2fs",
            attempt,
            MAX_PROVIDER_SAMPLING_ATTEMPTS,
            metadata.get("provider"),
            metadata.get("status_code"),
            metadata.get("error_kind"),
            retry_reason,
            delay_seconds,
        )
        await asyncio.sleep(delay_seconds)

    def get_last_response_payload(self) -> Optional[NormalizedLLMResponse]:
        """Return normalized payload captured for the most recent LLM turn."""
        if self._last_response_payload is None:
            return None
        return dict(self._last_response_payload)

    def _should_use_native_completion_path(
        self,
        tools: Optional[List[Dict[str, Any]]],
        model_id: str,
    ) -> bool:
        """
        Use non-stream completion for tool turns unless provider explicitly opts in.
        """
        if not tools:
            return False

        capability_checker = getattr(
            self.llm_client,
            "supports_streaming_tool_turns",
            None,
        )
        if not callable(capability_checker):
            return True

        try:
            supports_streaming = bool(capability_checker(model_id))
        except Exception:
            logger.warning(
                "Provider streaming tool-turn capability check failed; using non-stream fallback.",
                exc_info=True,
            )
            return True
        return not supports_streaming

    async def _iter_completion_stream(
        self,
        request_kwargs: Dict[str, Any],
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Stream completion using native tool-calling transport params."""
        async for event in self.llm_client.get_completion_stream(
            **request_kwargs,
        ):
            yield event

    @staticmethod
    def _build_completion_request_kwargs(
        model_id: str,
        prompt: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]],
        tool_choice: Optional[Any],
        parallel_tool_calls: Optional[bool],
        prompt_cache_key: Optional[str],
        native_web_search_enabled: Optional[bool],
        previous_response_id: Optional[str],
    ) -> Dict[str, Any]:
        """Build shared completion transport kwargs for stream and non-stream calls."""
        request_kwargs: Dict[str, Any] = {
            "model": model_id,
            "messages": prompt,
        }
        request_kwargs.update(
            build_tool_transport_kwargs(
                tools=tools,
                tool_choice=tool_choice,
                parallel_tool_calls=parallel_tool_calls,
                prompt_cache_key=prompt_cache_key,
                native_web_search_enabled=native_web_search_enabled,
            )
        )
        if isinstance(previous_response_id, str) and previous_response_id.strip():
            request_kwargs["previous_response_id"] = previous_response_id.strip()
        return request_kwargs

    def _resolve_previous_response_id(
        self,
        *,
        prompt: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]],
    ) -> Optional[str]:
        if str(self.session.cfg.model_provider or "").strip().lower() != "openai":
            return None
        if not tools or not prompt:
            return None
        if str(prompt[-1].get("role") or "").strip() != "tool":
            return None
        if not isinstance(self._last_response_payload, dict):
            return None
        response_id = self._last_response_payload.get("response_id")
        if not isinstance(response_id, str) or not response_id.strip():
            return None
        return response_id.strip()

    def _log_prompt_cache_hint(self, prompt: List[LLMMessage], model_id: str) -> int:
        """
        Emit prompt continuity diagnostics to estimate cache-eligibility across turns.

        This is a local heuristic:
        - `append_only` means prompt grew by appending new messages (best cache-eligibility)
        - `prefix_mutated` means earlier messages changed (likely cache invalidation from that point)
        """
        self._llm_turn_counter += 1
        turn = self._llm_turn_counter
        current_fingerprints = fingerprint_prompt(prompt)
        previous_fingerprints = self._last_prompt_fingerprints
        self._last_prompt_fingerprints = current_fingerprints

        continuity = derive_prompt_continuity(
            previous_fingerprints,
            current_fingerprints,
        )

        logger.info(
            "[Cache Hint] session=%s turn=%s model=%s status=%s "
            "prev_messages=%s current_messages=%s common_prefix_messages=%s "
            "first_changed_message=%s",
            self.session.session_id,
            turn,
            model_id,
            continuity.status,
            continuity.previous_count,
            continuity.current_count,
            continuity.common_prefix_messages,
            (
                continuity.first_changed_message
                if continuity.first_changed_message is not None
                else "none"
            ),
        )
        return turn

    def _log_provider_cache_diagnostics(self, model_id: str, turn: int) -> None:
        """
        Log provider-reported cache diagnostics (when exposed by provider/LiteLLM).
        """
        diagnostics = self.llm_client.get_last_stream_cache_diagnostics()
        if diagnostics is None:
            logger.info(
                "[Provider Cache] session=%s turn=%s model=%s status=unknown "
                "reason=client_diagnostics_unavailable",
                self.session.session_id,
                turn,
                model_id,
            )
            return

        logger.info(
            "[Provider Cache] session=%s turn=%s model=%s status=%s cache_hit=%s "
            "cached_tokens=%s prompt_tokens=%s completion_tokens=%s total_tokens=%s reason=%s",
            self.session.session_id,
            turn,
            diagnostics.get("model", model_id),
            diagnostics.get("status", "unknown"),
            diagnostics.get("cache_hit"),
            diagnostics.get("cached_tokens"),
            diagnostics.get("prompt_tokens"),
            diagnostics.get("completion_tokens"),
            diagnostics.get("total_tokens"),
            diagnostics.get("reason"),
        )

    async def _count_tokens(
        self,
        prompt: List[LLMMessage],
        full_text: str,
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> TokenCounts:
        """
        Counts tokens for input, output, and total conversation.

        ACCURACY FIX: Uses token_service.count_tokens() for output instead of
        hardcoded heuristic. The previous `len(full_text) // 4` heuristic was
        inaccurate for:
        - Code (different token density due to whitespace/symbols)
        - Non-English languages (CJK characters map 1 char to 1-2 tokens, causing
          400-800% underestimation)

        Runtime stability note:
        - Token counting runs inline in the current task to avoid executor hangs
          observed in this runtime when dispatching repeated `run_in_executor` calls.

        Args:
            prompt: Input messages sent to LLM
            full_text: Full response text from LLM

        Returns:
            TokenCounts named tuple with all token counts
        """
        return count_tokens(
            token_service=get_token_service(),
            llm_client=self.llm_client,
            conversation_history=self.session.history,
            model_id=self.session.cfg.selected_model_id,
            prompt=prompt,
            full_text=full_text,
            tools=tools,
        )

    def _count_provider_prompt_tokens_before_request(
        self,
        prompt: List[LLMMessage],
        *,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> int:
        """Count the provider-bound prompt and tool schemas before inference."""
        token_service = get_token_service()
        return token_service.count_tokens(
            prompt,
            self.session.cfg.selected_model_id,
            tools=tools,
        )

    def _resolve_prompt_cache_key(self) -> Optional[str]:
        """
        Resolve a stable cache key for providers that support prompt cache steering.

        Uses active conversation identity when available and falls back to session id.
        """
        runtime = getattr(self.session, "runtime", None)
        return resolve_prompt_cache_key_for_provider(
            provider_name=getattr(self.session.cfg, "model_provider", ""),
            active_conversation_ref=getattr(runtime, "active_conversation_ref", None),
            session_id=getattr(self.session, "session_id", None),
        )

    def _record_provider_prompt_tokens_for_compaction(
        self,
        token_counts: TokenCounts,
    ) -> None:
        if token_counts.usage_source != "provider":
            return
        compaction_engine = getattr(self.session, "compaction_engine", None)
        recorder = getattr(compaction_engine, "record_provider_prompt_tokens", None)
        if callable(recorder):
            recorder(token_counts.prompt_tokens)
