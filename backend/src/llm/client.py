"""
Abstraction layer for communicating with LLM providers using LiteLLM.

This module provides a unified interface for interacting with over 100
different Large Language Models (LLMs) through the LiteLLM library.
"""

import logging
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional, TYPE_CHECKING

from backend.src.core.config import AppConfig
from backend.src.core.events.streaming_events import ErrorEvent, StreamingEvent
from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.providers import get_provider

if TYPE_CHECKING:
    from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


# --- Abstract Base Class for LLM Clients ---


class LLMClient(ABC):
    """
    An abstract base class for LLM clients, defining a common interface.
    """

    @abstractmethod
    async def get_completion(self, model: str, messages: List[LLMMessage]) -> str:
        """
        Gets a completion from the LLM based on a list of messages.
        """

    async def get_completion_response(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """
        Gets a normalized completion payload.

        Default compatibility path for clients that only expose text completion.
        """
        content = await self.get_completion(model, messages)
        return {"content": content}

    @abstractmethod
    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Gets a streaming completion from the LLM, yielding StreamingEvent objects.
        """

    def get_last_stream_cache_diagnostics(self) -> Optional[Dict[str, Any]]:
        """
        Return cache diagnostics for the last streaming request, if available.
        """
        return None


class LiteLLMClient(LLMClient):
    """
    A simple orchestrator that delegates all real work to the provider layer.
    This client is now truly abstract and provider-agnostic.
    
    CONFIGURATION DRIFT: This client stores the AppConfig object passed at creation.
    When configuration is updated at runtime (e.g., API key change), the client must
    be recreated with the new config. AgentSession.update_config() handles this by
    calling get_llm_client(new_config) to create a fresh client instance.
    
    Stateless: Always fetches provider from factory. The factory handles caching
    of provider instances based on config values, ensuring freshness if config changes.
    """

    def __init__(self, cfg: AppConfig):
        """
        Initialize the LLM client with configuration.
        
        NOTE: This client holds a reference to the config object. If config is updated
        at runtime, a new client instance must be created (see AgentSession.update_config).
        """
        self.config = cfg
        self._last_stream_cache_diagnostics: Optional[Dict[str, Any]] = None

    def _get_provider(self) -> "LLMProvider":
        """
        Always fetch from the factory. The factory handles caching/hashing of config values.
        
        Returns:
            The appropriate LLM provider instance
            
        Raises:
            ValueError: If no provider is configured or available
        """
        provider_name = self.config.model_provider
        logger.info(
            "[LLM Client] Getting provider: provider_name='%s', selected_model_id='%s', api_key=%s",
            provider_name,
            self.config.selected_model_id,
            "set" if self.config.api_key else "not set",
        )
        return get_provider(self.config, provider_name)

    def _resolve_provider(self, model: str) -> "LLMProvider":
        """Resolve provider with normalized error semantics for non-stream callers."""
        try:
            return self._get_provider()
        except Exception as exc:
            raise LLMAPIError(f"LLM provider error: {exc}", model=model) from exc

    @staticmethod
    def _normalize_response_payload(
        response: Any, model: str
    ) -> NormalizedLLMResponse:
        """Validate provider response against the canonical normalized contract."""
        if not isinstance(response, dict):
            raise LLMAPIError(
                f"Invalid response type from provider: expected dict, got {type(response).__name__}",
                model=model,
            )

        if "content" not in response:
            raise LLMAPIError(
                f"Invalid response structure from provider: missing 'content' key. Keys: {list(response.keys())}",
                model=model,
            )

        content = response["content"]
        if not isinstance(content, str):
            raise LLMAPIError(
                f"Invalid content type from provider: expected str, got {type(content).__name__}",
                model=model,
            )

        normalized: NormalizedLLMResponse = {"content": content}

        tool_calls = response.get("tool_calls")
        if tool_calls is not None:
            if not isinstance(tool_calls, list):
                raise LLMAPIError(
                    "Invalid tool_calls type from provider: expected list",
                    model=model,
                )

            normalized_tool_calls = []
            for index, tool_call in enumerate(tool_calls):
                if not isinstance(tool_call, dict):
                    raise LLMAPIError(
                        f"Invalid tool call at index {index}: expected dict",
                        model=model,
                    )
                tool_id = tool_call.get("id")
                tool_name = tool_call.get("name")
                arguments = tool_call.get("arguments", {})

                if not isinstance(tool_id, str) or not tool_id:
                    raise LLMAPIError(
                        f"Invalid tool call id at index {index}: expected non-empty str",
                        model=model,
                    )
                if not isinstance(tool_name, str) or not tool_name:
                    raise LLMAPIError(
                        f"Invalid tool call name at index {index}: expected non-empty str",
                        model=model,
                    )
                if not isinstance(arguments, dict):
                    raise LLMAPIError(
                        f"Invalid tool call arguments at index {index}: expected dict",
                        model=model,
                    )

                normalized_tool_calls.append(
                    {"id": tool_id, "name": tool_name, "arguments": arguments}
                )

            normalized["tool_calls"] = normalized_tool_calls

        if "finish_reason" in response:
            finish_reason = response["finish_reason"]
            if finish_reason is not None and not isinstance(finish_reason, str):
                raise LLMAPIError(
                    "Invalid finish_reason type from provider: expected str or None",
                    model=model,
                )
            normalized["finish_reason"] = finish_reason

        return normalized

    @staticmethod
    def _extract_content(response: Any, model: str) -> str:
        """Backward-compatible helper retained for existing tests/callers."""
        normalized = LiteLLMClient._normalize_response_payload(response, model)
        return normalized["content"]

    async def get_completion_response(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """
        Delegates completion to provider and validates canonical response payload.
        """
        provider = self._resolve_provider(model)
        try:
            response = await provider.get_completion(model, messages)
        except LLMAPIError:
            raise
        except Exception as exc:
            raise LLMAPIError(f"LLM completion error: {exc}", model=model) from exc

        return self._normalize_response_payload(response, model)

    async def get_completion(self, model: str, messages: List[LLMMessage]) -> str:
        """
        Delegates getting a completion to the appropriate provider.
        
        Extracts content from normalized response with validation.
        
        Raises:
            LLMAPIError: If response structure is invalid
        """
        response = await self.get_completion_response(model, messages)
        return response["content"]

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Delegates getting a streaming completion to the appropriate provider.
        
        Catches exceptions from provider initialization and yields ErrorEvent
        for consistency with base class error handling pattern.
        """
        try:
            provider = self._resolve_provider(model)
        except LLMAPIError as exc:
            logger.error("Provider initialization failed: %s", exc)
            yield ErrorEvent(content=str(exc))
            return

        provider.clear_last_stream_usage()
        self._last_stream_cache_diagnostics = None
        try:
            # Provider's get_completion_stream handles its own exceptions and yields ErrorEvent
            async for event in provider.get_completion_stream(model, messages):
                yield event
        except Exception as exc:
            logger.error("Streaming iteration failed: %s", exc, exc_info=True)
            yield ErrorEvent(content=f"LLM streaming error: {str(exc)}")
        finally:
            self._last_stream_cache_diagnostics = provider.get_stream_cache_diagnostics(
                model=model
            )

    def get_last_stream_cache_diagnostics(self) -> Optional[Dict[str, Any]]:
        """Return cached diagnostics for the most recent streaming request."""
        if self._last_stream_cache_diagnostics is None:
            return None
        return dict(self._last_stream_cache_diagnostics)


def get_llm_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get an instance of the LiteLLM client.
    Caching is removed for simplicity, as object creation is cheap.
    """
    return LiteLLMClient(cfg)
