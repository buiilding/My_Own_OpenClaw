"""
LLM Stream Processor.

Handles LLM streaming, text aggregation, and token counting.
"""
import hashlib
import json
import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from backend.src.agent.llm.token_counting import TokenCounts, count_tokens
from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    ThinkingEvent,
    TokenCountEvent,
)
from backend.src.core.infrastructure.exceptions import LLMAPIError, LLMRateLimitError
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.services.token_service import get_token_service

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

    async def get_response(
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
        llm_start_time = time.perf_counter()
        model_id = self.session.cfg.selected_model_id
        turn = self._log_prompt_cache_hint(prompt, model_id)
        prompt_cache_key = self._resolve_prompt_cache_key()
        self._last_response_payload = None
        logger.info(
            "[Timing] LLM request started (session=%s, turn=%s, model=%s)",
            self.session.session_id,
            turn,
            model_id,
        )

        try:
            if self._should_use_native_completion_path(tools, model_id):
                response = await self._get_completion_response(
                    model_id=model_id,
                    prompt=prompt,
                    tools=tools,
                    tool_choice=tool_choice,
                    parallel_tool_calls=parallel_tool_calls,
                    prompt_cache_key=prompt_cache_key,
                )
                full_text = response.get("content", "")
                self._last_response_payload = response

                if full_text:
                    # Preserve frontend chunk contract for non-stream path.
                    yield ChunkEvent(content=full_text)

                self._log_provider_cache_diagnostics(model_id, turn)
            else:
                first_token_time = None
                full_text = ""
                async for event in self._iter_completion_stream(
                    model_id=model_id,
                    prompt=prompt,
                    tools=tools,
                    tool_choice=tool_choice,
                    parallel_tool_calls=parallel_tool_calls,
                    prompt_cache_key=prompt_cache_key,
                ):
                    if first_token_time is None:
                        first_token_time = time.perf_counter()
                        first_token_latency = first_token_time - llm_start_time
                        logger.info(
                            "[Timing] LLM first token received in %.3fs",
                            first_token_latency,
                        )

                    if isinstance(event, ChunkEvent):
                        full_text += event.content
                        yield event
                    elif isinstance(event, ThinkingEvent):
                        yield event
                    elif isinstance(event, ErrorEvent):
                        yield event
                    elif isinstance(event, FullResponseEvent):
                        # LLM client may emit full response directly (e.g., mock client).
                        full_text = event.content
                    else:
                        raise TypeError(
                            "Unsupported stream event type from LLM client: "
                            f"{type(event).__name__}"
                        )

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
                if isinstance(stream_payload, dict):
                    normalized_stream_payload = dict(stream_payload)
                    if not isinstance(normalized_stream_payload.get("content"), str):
                        normalized_stream_payload["content"] = full_text
                    self._last_response_payload = normalized_stream_payload
                else:
                    self._last_response_payload = {"content": full_text}
                self._log_provider_cache_diagnostics(model_id, turn)

            yield FullResponseEvent(content=full_text)

            token_counts = await self._count_tokens(prompt, full_text)
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
                "[Timing] LLM response completed in %.3fs (model=%s, tokens=%s)",
                llm_total_time,
                model_id,
                token_counts.total_tokens,
            )

        except LLMRateLimitError:
            yield ErrorEvent(content="Rate limit exceeded. Please wait.")
            raise
        except LLMAPIError as e:
            logger.error(f"LLM API error: {e}", exc_info=True)
            yield ErrorEvent(content=self._build_llm_api_error_message(e))
            raise
        except Exception as e:
            logger.error(f"LLM error: {e}", exc_info=True)
            yield ErrorEvent(content=f"LLM error: {str(e)}")
            raise

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
        model_id: str,
        prompt: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]],
        tool_choice: Optional[Any],
        parallel_tool_calls: Optional[bool],
        prompt_cache_key: Optional[str],
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Stream completion using native tool-calling transport params."""
        request_kwargs: Dict[str, Any] = {
            "model": model_id,
            "messages": prompt,
            "tools": tools,
            "tool_choice": tool_choice,
            "parallel_tool_calls": parallel_tool_calls,
        }
        if isinstance(prompt_cache_key, str):
            normalized_cache_key = prompt_cache_key.strip()
            if normalized_cache_key:
                request_kwargs["prompt_cache_key"] = normalized_cache_key

        async for event in self.llm_client.get_completion_stream(
            **request_kwargs,
        ):
            yield event

    async def _get_completion_response(
        self,
        model_id: str,
        prompt: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]],
        tool_choice: Optional[Any],
        parallel_tool_calls: Optional[bool],
        prompt_cache_key: Optional[str],
    ) -> NormalizedLLMResponse:
        """Completion call using native tool-calling transport params."""
        request_kwargs: Dict[str, Any] = {
            "model": model_id,
            "messages": prompt,
            "tools": tools,
            "tool_choice": tool_choice,
            "parallel_tool_calls": parallel_tool_calls,
        }
        if isinstance(prompt_cache_key, str):
            normalized_cache_key = prompt_cache_key.strip()
            if normalized_cache_key:
                request_kwargs["prompt_cache_key"] = normalized_cache_key
        return await self.llm_client.get_completion_response(**request_kwargs)

    def _log_prompt_cache_hint(self, prompt: List[LLMMessage], model_id: str) -> int:
        """
        Emit prompt continuity diagnostics to estimate cache-eligibility across turns.

        This is a local heuristic:
        - `append_only` means prompt grew by appending new messages (best cache-eligibility)
        - `prefix_mutated` means earlier messages changed (likely cache invalidation from that point)
        """
        self._llm_turn_counter += 1
        turn = self._llm_turn_counter
        current_fingerprints = self._fingerprint_prompt(prompt)
        previous_fingerprints = self._last_prompt_fingerprints
        self._last_prompt_fingerprints = current_fingerprints

        if previous_fingerprints is None:
            status = "cold_start"
            common_prefix_messages = 0
            first_changed_message = None
            previous_count = 0
        else:
            previous_count = len(previous_fingerprints)
            common_prefix_messages = self._common_prefix_length(
                previous_fingerprints, current_fingerprints
            )
            if (
                common_prefix_messages == len(previous_fingerprints)
                and len(current_fingerprints) >= len(previous_fingerprints)
            ):
                status = "append_only"
            elif (
                common_prefix_messages == len(current_fingerprints)
                and len(current_fingerprints) < len(previous_fingerprints)
            ):
                status = "history_shortened"
            else:
                status = "prefix_mutated"
            first_changed_message = (
                common_prefix_messages + 1
                if common_prefix_messages < max(previous_count, len(current_fingerprints))
                else None
            )

        logger.info(
            "[Cache Hint] session=%s turn=%s model=%s status=%s "
            "prev_messages=%s current_messages=%s common_prefix_messages=%s "
            "first_changed_message=%s",
            self.session.session_id,
            turn,
            model_id,
            status,
            previous_count,
            len(current_fingerprints),
            common_prefix_messages,
            first_changed_message if first_changed_message is not None else "none",
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

    @staticmethod
    def _build_llm_api_error_message(error: LLMAPIError) -> str:
        """Return a concise user-facing error for known API failure classes."""
        if error.status_code == 520:
            return "Kimi Coding is temporarily unavailable (HTTP 520). Please retry shortly."
        if error.status_code is not None:
            return f"LLM API error (HTTP {error.status_code}). Please retry."
        return f"LLM API error: {error.message}"

    @staticmethod
    def _common_prefix_length(first: List[str], second: List[str]) -> int:
        """Return number of leading messages that are identical."""
        matched = 0
        for left, right in zip(first, second):
            if left != right:
                break
            matched += 1
        return matched

    def _fingerprint_prompt(self, prompt: List[LLMMessage]) -> List[str]:
        """Generate stable message fingerprints for continuity comparison."""
        return [self._fingerprint_message(message) for message in prompt]

    @staticmethod
    def _fingerprint_message(message: LLMMessage) -> str:
        """Generate a short hash for one prompt message."""
        role = str(message.get("role", ""))
        compact_content = LLMStreamProcessor._compact_for_fingerprint(
            message.get("content", "")
        )
        encoded = json.dumps(
            {"role": role, "content": compact_content},
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _compact_for_fingerprint(value: Any) -> Any:
        """
        Compact potentially huge content (for example base64 images) before hashing.
        """
        if isinstance(value, str):
            max_chars = 2048
            if len(value) <= max_chars:
                return value
            head = value[:1024]
            tail = value[-1024:]
            return f"{head}<len={len(value)}>{tail}"

        if isinstance(value, list):
            return [LLMStreamProcessor._compact_for_fingerprint(item) for item in value]

        if isinstance(value, dict):
            return {
                str(key): LLMStreamProcessor._compact_for_fingerprint(value[key])
                for key in sorted(value.keys(), key=str)
            }

        return value

    async def _count_tokens(
        self, prompt: List[LLMMessage], full_text: str
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
        )

    def _resolve_prompt_cache_key(self) -> Optional[str]:
        """
        Resolve a stable cache key for providers that support prompt cache steering.

        Uses active conversation identity when available and falls back to session id.
        """
        provider_name = str(getattr(self.session.cfg, "model_provider", "") or "").strip().lower()
        normalized_provider_name = provider_name.replace("_", "-")
        if normalized_provider_name in ("kimi-code", "kimi-coding"):
            normalized_provider_name = "kimi-coding"
        if normalized_provider_name != "kimi-coding":
            return None

        runtime = getattr(self.session, "runtime", None)
        active_conversation_ref = getattr(runtime, "active_conversation_ref", None)
        if isinstance(active_conversation_ref, str):
            normalized_ref = active_conversation_ref.strip()
            if normalized_ref:
                return normalized_ref

        session_id = getattr(self.session, "session_id", None)
        if isinstance(session_id, str):
            normalized_session_id = session_id.strip()
            if normalized_session_id:
                return normalized_session_id
        return None
