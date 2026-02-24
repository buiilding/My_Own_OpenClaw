import copy
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

import litellm

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent, ThinkingEvent
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.base import LLMProvider
from backend.src.llm.providers.online import OnlineLLMProvider

logger = logging.getLogger(__name__)


class KimiCodingProvider(OnlineLLMProvider):
    """Provider for Kimi Coding (Anthropic-compatible endpoint)."""

    DEFAULT_BASE_URL = "https://api.kimi.com/coding"
    provider_label = "Kimi Coding"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        if base_url is None:
            base_url = self.DEFAULT_BASE_URL
        elif base_url.endswith("/v1"):
            base_url = base_url[: -len("/v1")]
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Kimi stream path accumulates and finalizes tool-call payloads safely.
        """
        _ = model
        return True

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """Internal streaming implementation. Exceptions bubble up to base class."""
        params = self._build_standard_completion_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
            include_stream=True,
        )
        stream = await litellm.acompletion(**params)
        full_text_parts: List[str] = []
        tool_call_deltas: Dict[int, Dict[str, Any]] = {}
        finish_reason: Optional[str] = None
        async for chunk in stream:
            self._record_stream_usage_from_chunk(chunk)
            finish_reason = self._extract_chunk_finish_reason(chunk) or finish_reason
            delta = self._extract_stream_delta(chunk)
            if not delta:
                continue

            self._accumulate_stream_tool_calls(delta, tool_call_deltas)

            thinking_content = self._extract_thinking_content(delta)
            if thinking_content:
                yield ThinkingEvent(content=thinking_content)

            content = self._extract_delta_content(delta)
            if content:
                full_text_parts.append(content)
                yield ChunkEvent(content=content)

        normalized_response: NormalizedLLMResponse = {
            "content": "".join(full_text_parts)
        }
        tool_calls = self._finalize_stream_tool_calls(
            tool_call_deltas=tool_call_deltas,
            model=model,
        )
        if tool_calls:
            normalized_response["tool_calls"] = tool_calls
        if finish_reason:
            normalized_response["finish_reason"] = finish_reason
        self._set_last_stream_response_payload(normalized_response)

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id == "kimi-for-coding":
            return "k2p5"
        if model_id.startswith("kimi-coding/"):
            return model_id.split("/", 1)[1]
        if model_id.startswith("kimi-code/"):
            return model_id.split("/", 1)[1]
        if model_id.startswith("anthropic/"):
            return model_id.split("/", 1)[1]
        return model_id

    def _build_request_params(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> dict:
        params = super()._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        params["custom_llm_provider"] = "anthropic"
        return params

    @staticmethod
    def _extract_chunk_finish_reason(chunk: Any) -> Optional[str]:
        """Extract finish_reason when provider includes it on stream chunks."""
        if not chunk:
            return None
        choices = chunk.get("choices") if isinstance(chunk, dict) else getattr(chunk, "choices", None)
        first_choice = LLMProvider._first_item(choices)
        if first_choice is None:
            return None
        value = LLMProvider._get_value(first_choice, "finish_reason")
        if value is None:
            return None
        return str(value)

    def _accumulate_stream_tool_calls(
        self,
        delta: Any,
        tool_call_deltas: Dict[int, Dict[str, Any]],
    ) -> None:
        """Accumulate OpenAI/Anthropic style tool-call deltas from one chunk."""
        raw_tool_calls = LLMProvider._get_value(delta, "tool_calls")
        if raw_tool_calls:
            for call_index, raw_tool_call in enumerate(raw_tool_calls):
                index = LLMProvider._get_value(raw_tool_call, "index")
                if not isinstance(index, int):
                    index = call_index
                state = tool_call_deltas.setdefault(
                    index,
                    {
                        "id": None,
                        "name": None,
                        "arguments_chunks": [],
                        "arguments_obj": None,
                    },
                )
                call_id = LLMProvider._get_value(raw_tool_call, "id")
                if isinstance(call_id, str) and call_id.strip():
                    state["id"] = call_id

                function_payload = LLMProvider._get_value(raw_tool_call, "function")
                name = (
                    LLMProvider._get_value(function_payload, "name")
                    if function_payload is not None
                    else None
                ) or LLMProvider._get_value(raw_tool_call, "name")
                if isinstance(name, str) and name.strip():
                    state["name"] = name.strip()

                raw_arguments = (
                    LLMProvider._get_value(function_payload, "arguments")
                    if function_payload is not None
                    else None
                )
                if raw_arguments is None:
                    raw_arguments = LLMProvider._get_value(raw_tool_call, "arguments")

                if isinstance(raw_arguments, str) and raw_arguments:
                    state["arguments_chunks"].append(raw_arguments)
                elif isinstance(raw_arguments, dict):
                    state["arguments_obj"] = copy.deepcopy(raw_arguments)

        content_blocks = LLMProvider._get_value(delta, "content")
        if isinstance(content_blocks, list):
            for block_index, block in enumerate(content_blocks):
                if LLMProvider._get_value(block, "type") != "tool_use":
                    continue
                index = LLMProvider._get_value(block, "index")
                if not isinstance(index, int):
                    index = block_index
                state = tool_call_deltas.setdefault(
                    index,
                    {
                        "id": None,
                        "name": None,
                        "arguments_chunks": [],
                        "arguments_obj": None,
                    },
                )
                call_id = LLMProvider._get_value(block, "id") or LLMProvider._get_value(block, "tool_use_id")
                if isinstance(call_id, str) and call_id.strip():
                    state["id"] = call_id

                name = LLMProvider._get_value(block, "name")
                if isinstance(name, str) and name.strip():
                    state["name"] = name.strip()

                raw_input = LLMProvider._get_value(block, "input")
                if isinstance(raw_input, dict):
                    state["arguments_obj"] = copy.deepcopy(raw_input)
                elif isinstance(raw_input, str) and raw_input:
                    state["arguments_chunks"].append(raw_input)

    def _finalize_stream_tool_calls(
        self,
        *,
        tool_call_deltas: Dict[int, Dict[str, Any]],
        model: str,
    ) -> List[Dict[str, Any]]:
        """Build normalized tool-calls from accumulated stream deltas."""
        normalized_tool_calls: List[Dict[str, Any]] = []
        for index in sorted(tool_call_deltas.keys()):
            state = tool_call_deltas[index]
            name = state.get("name")
            if not isinstance(name, str) or not name.strip():
                continue

            tool_call_id = state.get("id")
            if not isinstance(tool_call_id, str) or not tool_call_id.strip():
                tool_call_id = f"tool_call_{index}"

            if isinstance(state.get("arguments_obj"), dict):
                arguments = copy.deepcopy(state["arguments_obj"])
            else:
                raw_arguments = "".join(state.get("arguments_chunks", []))
                try:
                    arguments = self._normalize_tool_arguments(
                        raw_arguments,
                        model=model,
                        invalid_response_message="Invalid response from Kimi Coding stream",
                    )
                except Exception:
                    logger.warning(
                        "Failed to parse streamed tool-call arguments for id=%s; defaulting to empty object",
                        tool_call_id,
                    )
                    arguments = {}

            normalized_tool_calls.append(
                {
                    "id": tool_call_id,
                    "name": name.strip(),
                    "arguments": arguments,
                }
            )
        return normalized_tool_calls
