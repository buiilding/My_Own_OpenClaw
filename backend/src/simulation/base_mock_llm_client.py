"""
Shared base class for simulation-oriented mock LLM clients.
"""

import logging
from typing import AsyncGenerator, List

from backend.src.core.config import AppConfig
from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.client import LLMClient
from backend.src.simulation.native_tool_adapter import (
    build_normalized_response,
    extract_response_text,
)


class BaseSimulationLLMClient(LLMClient):
    """Common behavior for simulation clients backed by static responses."""

    def __init__(
        self,
        cfg: AppConfig,
        responses: List[dict[str, str]],
        *,
        call_id_prefix: str,
        logger_name: str,
    ) -> None:
        self.config = cfg
        self._responses = responses
        self._call_id_prefix = call_id_prefix
        self._logger_name = logger_name
        self._logger = logging.getLogger(__name__)
        self._iteration = 0
        self._max_iterations = len(self._responses)
        self._pending_final_response: str | None = None
        self._logger.info(
            "%s initialized with %s hardcoded responses",
            self._logger_name,
            self._max_iterations,
        )

    def _final_response_text(self) -> str:
        return extract_response_text(self._responses[-1]["response"])

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ) -> str:
        if self._iteration >= self._max_iterations:
            self._logger.warning("%s: Exceeded max iterations, returning final message", self._logger_name)
            return self._responses[-1]["response"]

        response = self._responses[self._iteration]["response"]
        self._iteration += 1
        self._logger.info(
            "%s.get_completion: Returning response for iteration %s",
            self._logger_name,
            self._iteration - 1,
        )
        return response

    async def get_completion_response(
        self,
        model: str,
        messages: List[LLMMessage],
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ) -> NormalizedLLMResponse:
        if self._pending_final_response:
            pending_text = self._pending_final_response
            self._pending_final_response = None
            return {"content": pending_text, "finish_reason": "stop"}

        if self._iteration >= self._max_iterations:
            self._logger.warning("%s: Exceeded max iterations, returning final message", self._logger_name)
            return {"content": self._final_response_text(), "finish_reason": "stop"}

        response_text = self._responses[self._iteration]["response"]
        iteration_num = self._iteration
        self._iteration += 1

        normalized = build_normalized_response(
            response_text,
            call_id_prefix=self._call_id_prefix,
            iteration=iteration_num,
        )
        if normalized.get("tool_calls") and normalized.get("content"):
            # Match native model behavior: tool turns should not emit final text content.
            self._pending_final_response = str(normalized["content"])
            normalized["content"] = ""
        return normalized

    async def get_completion_stream(
        self,
        model: str,
        messages: List[LLMMessage],
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ) -> AsyncGenerator[StreamingEvent, None]:
        if self._iteration >= self._max_iterations:
            self._logger.warning("%s: Exceeded max iterations, returning final message", self._logger_name)
            final_response = self._responses[-1]["response"]
            for char in final_response:
                yield ChunkEvent(content=char)
            return

        response = self._responses[self._iteration]["response"]
        iteration_num = self._iteration
        self._iteration += 1

        self._logger.info(
            "%s.get_completion_stream: Returning response for iteration %s",
            self._logger_name,
            iteration_num,
        )
        self._logger.debug("%s: Response content: %s...", self._logger_name, response[:200])
        for char in response:
            yield ChunkEvent(content=char)

    def reset(self) -> None:
        self._iteration = 0
        self._pending_final_response = None
        self._logger.info("%s: Reset iteration counter", self._logger_name)
