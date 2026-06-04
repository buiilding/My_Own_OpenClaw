"""
Shared base class for simulation-oriented mock LLM clients.
"""

import copy
import json
import logging
from typing import AsyncGenerator, List

from backend.src.core.config import AppConfig
from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.client import LLMClient


class BaseSimulationLLMClient(LLMClient):
    """Common behavior for simulation clients backed by static responses."""

    def __init__(
        self,
        cfg: AppConfig,
        responses: List[NormalizedLLMResponse],
        *,
        logger_name: str,
    ) -> None:
        self.config = cfg
        self._responses = responses
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
        return self._responses[-1].get("content", "")

    @staticmethod
    def _completion_text(response: NormalizedLLMResponse) -> str:
        if response.get("tool_calls"):
            return json.dumps(response, sort_keys=True)
        return response.get("content", "")

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ) -> str:
        if self._iteration >= self._max_iterations:
            self._logger.warning(
                "%s: Exceeded max iterations, returning final message",
                self._logger_name,
            )
            return self._completion_text(self._responses[-1])

        response = self._responses[self._iteration]
        self._iteration += 1
        self._logger.info(
            "%s.get_completion: Returning response for iteration %s",
            self._logger_name,
            self._iteration - 1,
        )
        return self._completion_text(response)

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
            self._logger.warning(
                "%s: Exceeded max iterations, returning final message",
                self._logger_name,
            )
            return {"content": self._final_response_text(), "finish_reason": "stop"}

        normalized = copy.deepcopy(self._responses[self._iteration])
        self._iteration += 1

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
            self._logger.warning(
                "%s: Exceeded max iterations, returning final message",
                self._logger_name,
            )
            final_response = self._completion_text(self._responses[-1])
            for char in final_response:
                yield ChunkEvent(content=char)
            return

        response = self._completion_text(self._responses[self._iteration])
        iteration_num = self._iteration
        self._iteration += 1

        self._logger.info(
            "%s.get_completion_stream: Returning response for iteration %s",
            self._logger_name,
            iteration_num,
        )
        self._logger.debug(
            "%s: Response content: %s...", self._logger_name, response[:200]
        )
        for char in response:
            yield ChunkEvent(content=char)

    def supports_streaming_tool_turns(self, model: str) -> bool:
        _ = model
        return False

    def reset(self) -> None:
        self._iteration = 0
        self._pending_final_response = None
        self._logger.info("%s: Reset iteration counter", self._logger_name)
