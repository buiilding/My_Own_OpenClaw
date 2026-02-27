import copy
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent, ThinkingEvent
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)
_TOOL_ARGUMENTS_PREVIEW_CHARS = 4000


class StreamingToolCallAggregationMixin:
    """
    Shared stream-time tool-call aggregation for providers that emit
    OpenAI-style deltas and/or block-style tool-use chunks.
    """

    tool_turn_invalid_response_message = "Invalid response from stream"
    tool_turn_parse_warning_prefix = "Failed to parse streamed tool-call arguments"

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> AsyncGenerator[StreamingEvent, None]:
        stream = await self._open_stream(
            model=model,
            messages=messages,
            completion_kwargs=request_kwargs,
        )
        full_text_parts: List[str] = []
        tool_call_deltas: Dict[int, Dict[str, Any]] = {}
        finish_reason: Optional[str] = None

        async for chunk in stream:
            self._record_stream_usage_from_chunk(chunk)
            finish_reason = self._extract_stream_finish_reason(chunk) or finish_reason
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
            "content": "".join(full_text_parts),
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

    def _accumulate_stream_tool_calls(
        self,
        delta: Any,
        tool_call_deltas: Dict[int, Dict[str, Any]],
    ) -> None:
        """Accumulate OpenAI-style + block-style tool-call deltas."""
        raw_tool_calls = LLMProvider._get_value(delta, "tool_calls")
        if raw_tool_calls:
            for call_index, raw_tool_call in enumerate(raw_tool_calls):
                index = LLMProvider._get_value(raw_tool_call, "index")
                if not isinstance(index, int):
                    index = call_index
                state = self._get_or_init_tool_call_state(tool_call_deltas, index)
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
                state = self._get_or_init_tool_call_state(tool_call_deltas, index)
                call_id = (
                    LLMProvider._get_value(block, "id")
                    or LLMProvider._get_value(block, "tool_use_id")
                )
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

    @staticmethod
    def _get_or_init_tool_call_state(
        tool_call_deltas: Dict[int, Dict[str, Any]],
        index: int,
    ) -> Dict[str, Any]:
        """Return mutable tool-call delta state entry for the provided index."""
        return tool_call_deltas.setdefault(
            index,
            {
                "id": None,
                "name": None,
                "arguments_chunks": [],
                "arguments_obj": None,
            },
        )

    def _finalize_stream_tool_calls(
        self,
        *,
        tool_call_deltas: Dict[int, Dict[str, Any]],
        model: str,
    ) -> List[Dict[str, Any]]:
        """Build normalized tool calls from accumulated stream deltas."""
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
                        invalid_response_message=self.tool_turn_invalid_response_message,
                    )
                except LLMAPIError as exc:
                    arguments_preview = self._preview_tool_arguments(raw_arguments)
                    parse_error_summary = " ".join(str(exc).split()).strip()
                    logger.warning(
                        "%s for id=%s; aborting tool turn. preview=%r",
                        self.tool_turn_parse_warning_prefix,
                        tool_call_id,
                        arguments_preview,
                    )
                    raise LLMAPIError(
                        (
                            f"{self.tool_turn_invalid_response_message}: failed to parse streamed "
                            f"tool-call arguments for id={tool_call_id} name={name.strip()}. "
                            f"Raw arguments preview: {arguments_preview!r}"
                        ),
                        model=model,
                        metadata={
                            "llm_tool_call_parse_failed": True,
                            "llm_tool_call_id": tool_call_id,
                            "llm_tool_name": name.strip(),
                            "llm_tool_call_parse_error": parse_error_summary,
                            "llm_tool_call_raw_arguments_preview": arguments_preview,
                            "llm_tool_call_raw_arguments_preview_truncated": (
                                len(raw_arguments.strip()) > _TOOL_ARGUMENTS_PREVIEW_CHARS
                            ),
                        },
                    ) from exc

            normalized_tool_calls.append(
                {
                    "id": tool_call_id,
                    "name": name.strip(),
                    "arguments": arguments,
                }
            )
        return normalized_tool_calls

    @staticmethod
    def _preview_tool_arguments(raw_arguments: str) -> str:
        payload = raw_arguments.strip()
        if len(payload) <= _TOOL_ARGUMENTS_PREVIEW_CHARS:
            return payload
        return f"{payload[:_TOOL_ARGUMENTS_PREVIEW_CHARS]}...[truncated]"
