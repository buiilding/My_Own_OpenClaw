"""
Abstraction layer for communicating with LLM providers using LiteLLM.

This module provides a unified interface for interacting with over 100
different Large Language Models (LLMs) through the LiteLLM library.
"""

import copy
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
    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> str:
        """
        Gets a completion from the LLM based on a list of messages.
        """

    async def get_completion_response(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> NormalizedLLMResponse:
        """
        Gets a normalized completion payload.

        Default compatibility path for clients that only expose text completion.
        """
        content = await self.get_completion(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        return {"content": content}

    @abstractmethod
    async def get_completion_stream(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Gets a streaming completion from the LLM, yielding StreamingEvent objects.
        """

    def get_last_stream_cache_diagnostics(self) -> Optional[Dict[str, Any]]:
        """
        Return cache diagnostics for the last streaming request, if available.
        """
        return None

    def get_last_stream_response_payload(self) -> Optional[NormalizedLLMResponse]:
        """
        Return normalized payload for the last streaming request, if available.
        """
        return None

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Return whether tool-enabled turns can safely use stream transport.

        Default stays conservative for compatibility with existing clients.
        """
        _ = model
        return False


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
        self._last_stream_response_payload: Optional[NormalizedLLMResponse] = None

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
    def _normalize_content(
        response: Dict[str, Any],
        *,
        model: str,
    ) -> str:
        """Normalize required content field from provider response payload."""
        if "content" not in response:
            raise LLMAPIError(
                f"Invalid response structure from provider: missing 'content' key. Keys: {list(response.keys())}",
                model=model,
            )

        content = response["content"]
        if content is None:
            content = ""
        if not isinstance(content, str):
            raise LLMAPIError(
                f"Invalid content type from provider: expected str, got {type(content).__name__}",
                model=model,
            )
        return content

    @staticmethod
    def _normalize_tool_call_entry(
        tool_call: Any,
        *,
        index: int,
        model: str,
    ) -> Dict[str, Any]:
        """Normalize one tool call object into canonical id/name/arguments fields."""
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
        return {"id": tool_id, "name": tool_name, "arguments": arguments}

    @staticmethod
    def _normalize_tool_calls(
        tool_calls: Any,
        *,
        model: str,
    ) -> Optional[List[Dict[str, Any]]]:
        """Normalize provider tool calls into canonical [{id,name,arguments}] form."""
        if tool_calls is not None:
            if not isinstance(tool_calls, list):
                raise LLMAPIError(
                    "Invalid tool_calls type from provider: expected list",
                    model=model,
                )

            normalized_tool_calls = []
            for index, tool_call in enumerate(tool_calls):
                normalized_tool_calls.append(
                    LiteLLMClient._normalize_tool_call_entry(
                        tool_call,
                        index=index,
                        model=model,
                    )
                )
            return normalized_tool_calls
        return None

    @staticmethod
    def _normalize_finish_reason(
        finish_reason: Any,
        *,
        model: str,
    ) -> Optional[str]:
        """Normalize finish reason type from provider response."""
        if finish_reason is None:
            return None
        if not isinstance(finish_reason, str):
            raise LLMAPIError(
                "Invalid finish_reason type from provider: expected str or None",
                model=model,
            )
        return finish_reason

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

        normalized: NormalizedLLMResponse = {
            "content": LiteLLMClient._normalize_content(response, model=model)
        }

        normalized_tool_calls = LiteLLMClient._normalize_tool_calls(
            response.get("tool_calls"),
            model=model,
        )
        if normalized_tool_calls is not None:
            normalized["tool_calls"] = normalized_tool_calls

        if "finish_reason" in response:
            normalized["finish_reason"] = LiteLLMClient._normalize_finish_reason(
                response["finish_reason"],
                model=model,
            )

        return normalized

    @staticmethod
    def _extract_content(response: Any, model: str) -> str:
        """Backward-compatible helper retained for existing tests/callers."""
        normalized = LiteLLMClient._normalize_response_payload(response, model)
        return normalized["content"]

    @staticmethod
    def _build_provider_request_kwargs(
        tools: Optional[List[Dict[str, Any]]],
        tool_choice: Optional[Any],
        parallel_tool_calls: Optional[bool],
        prompt_cache_key: Optional[str],
    ) -> Dict[str, Any]:
        """Build shared provider kwargs for completion and streaming requests."""
        request_kwargs = {
            "tools": tools,
            "tool_choice": tool_choice,
            "parallel_tool_calls": parallel_tool_calls,
        }
        if isinstance(prompt_cache_key, str):
            normalized_key = prompt_cache_key.strip()
            if normalized_key:
                request_kwargs["prompt_cache_key"] = normalized_key
        return request_kwargs

    def _reset_stream_tracking_state(self, provider: "LLMProvider") -> None:
        """Reset cached stream diagnostics/payload before a new provider call."""
        provider.clear_last_stream_usage()
        self._last_stream_cache_diagnostics = None
        self._last_stream_response_payload = None

    def _capture_stream_tracking_state(
        self,
        *,
        provider: "LLMProvider",
        model: str,
        response_payload: Optional[NormalizedLLMResponse] = None,
    ) -> None:
        """Capture provider diagnostics and payload after completion/streaming."""
        self._last_stream_cache_diagnostics = provider.get_stream_cache_diagnostics(
            model=model
        )
        if response_payload is None:
            response_payload = provider.get_last_stream_response_payload()
        self._last_stream_response_payload = response_payload

    async def get_completion_response(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> NormalizedLLMResponse:
        """
        Delegates completion to provider and validates canonical response payload.
        """
        provider = self._resolve_provider(model)
        self._reset_stream_tracking_state(provider)

        try:
            request_kwargs = self._build_provider_request_kwargs(
                tools=tools,
                tool_choice=tool_choice,
                parallel_tool_calls=parallel_tool_calls,
                prompt_cache_key=prompt_cache_key,
            )
            response = await provider.get_completion(
                model,
                messages,
                **request_kwargs,
            )
        except LLMAPIError:
            raise
        except Exception as exc:
            raise LLMAPIError(f"LLM completion error: {exc}", model=model) from exc

        normalized = self._normalize_response_payload(response, model)
        self._capture_stream_tracking_state(
            provider=provider,
            model=model,
            response_payload=normalized,
        )
        return normalized

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
    ) -> str:
        """
        Delegates getting a completion to the appropriate provider.
        
        Extracts content from normalized response with validation.
        
        Raises:
            LLMAPIError: If response structure is invalid
        """
        response = await self.get_completion_response(
            model=model,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
            prompt_cache_key=prompt_cache_key,
        )
        return response["content"]

    async def get_completion_stream(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
        prompt_cache_key: Optional[str] = None,
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

        self._reset_stream_tracking_state(provider)
        try:
            request_kwargs = self._build_provider_request_kwargs(
                tools=tools,
                tool_choice=tool_choice,
                parallel_tool_calls=parallel_tool_calls,
                prompt_cache_key=prompt_cache_key,
            )
            # Provider's get_completion_stream handles its own exceptions and yields ErrorEvent
            async for event in provider.get_completion_stream(
                model,
                messages,
                **request_kwargs,
            ):
                yield event
        except Exception as exc:
            logger.error("Streaming iteration failed: %s", exc, exc_info=True)
            yield ErrorEvent(content=f"LLM streaming error: {str(exc)}")
        finally:
            self._capture_stream_tracking_state(
                provider=provider,
                model=model,
            )

    def get_last_stream_cache_diagnostics(self) -> Optional[Dict[str, Any]]:
        """Return cached diagnostics for the most recent streaming request."""
        if self._last_stream_cache_diagnostics is None:
            return None
        return copy.deepcopy(self._last_stream_cache_diagnostics)

    def get_last_stream_response_payload(self) -> Optional[NormalizedLLMResponse]:
        """Return normalized payload captured for the most recent stream turn."""
        if self._last_stream_response_payload is None:
            return None
        return copy.deepcopy(self._last_stream_response_payload)

    def supports_streaming_tool_turns(self, model: str) -> bool:
        """
        Delegate tool-turn streaming capability checks to the resolved provider.
        """
        try:
            provider = self._resolve_provider(model)
        except LLMAPIError as exc:
            logger.warning(
                "Unable to resolve provider for streaming tool-turn capability check: %s",
                exc,
            )
            return False
        return bool(provider.supports_streaming_tool_turns(model))


def get_llm_client(cfg: AppConfig) -> LLMClient:
    """
    Factory function to get an instance of the LiteLLM client.
    Caching is removed for simplicity, as object creation is cheap.
    """
    return LiteLLMClient(cfg)
