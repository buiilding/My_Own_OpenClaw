from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional
import logging
import re

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events.streaming_events import ErrorEvent, StreamingEvent
from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse

logger = logging.getLogger(__name__)
THINKING_TAG_PATTERN = re.compile(r"<thinking>(.*?)</thinking>", re.DOTALL)


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    
    Enforces consistent error handling and dependency injection.
    Providers receive only the primitives they need, not the entire config object.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
    ):
        """
        Initialize provider with only required dependencies.
        
        Args:
            api_key: API key for the provider (optional for local providers)
            base_url: Base URL for the provider API (optional for cloud providers)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self._validate_dependencies()

    @abstractmethod
    def _validate_dependencies(self) -> None:
        """
        Validate that required dependencies are present.
        
        Raises:
            ValueError: If required dependencies are missing
        """
        pass

    @abstractmethod
    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """
        Gets a completion from the LLM and returns a normalized response.
        
        NOTE: Error handling differs from streaming:
        - Non-streaming (this method): Raises exceptions (LLMAPIError, LLMRateLimitError, LLMError)
        - Streaming (get_completion_stream): Catches exceptions and yields ErrorEvent
        
        This design allows callers to handle errors differently:
        - Non-streaming: Use try/except for control flow
        - Streaming: Process error events in the event stream
        """
        pass

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Public streaming method with uniform error handling.
        
        All providers must yield events, never raise exceptions.
        This ensures Liskov Substitution Principle compliance.
        
        Errors are converted to ErrorEvent and yielded in the stream,
        allowing callers to handle errors as part of the event flow
        rather than via exception handling.
        """
        try:
            async for event in self._stream_internal(model, messages):
                yield event
        except litellm_exceptions.RateLimitError as e:
            logger.error(f"Rate limit error in {self.__class__.__name__}: {e}")
            yield ErrorEvent(content="Rate limit exceeded. Please try again later.")
        except litellm_exceptions.APIError as e:
            logger.error(f"API error in {self.__class__.__name__}: {e}")
            yield ErrorEvent(content=f"External API error: {str(e)}")
        except Exception as e:
            logger.error(
                f"Unexpected error in {self.__class__.__name__}: {e}",
                exc_info=True
            )
            yield ErrorEvent(content=f"Unexpected system error: {str(e)}")

    @abstractmethod
    async def _stream_internal(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Internal streaming implementation.
        
        DO NOT catch exceptions here; let them bubble up to get_completion_stream.
        Subclasses should only implement the streaming logic, not error handling.
        """
        pass

    @abstractmethod
    async def list_models(self) -> List[Dict[str, str]]:
        """
        Lists available models from the provider.

        Returns:
            List of model dictionaries with 'id', 'provider', and 'display_name'.
        """
        pass

    def _build_request_params(
        self,
        model: str,
        messages: List[LLMMessage],
        model_string: Optional[str] = None,
    ) -> dict:
        """
        Helper to construct the basic request parameters for LiteLLM.
        
        Args:
            model: Model identifier (must be non-empty string)
            messages: List of messages
            model_string: Optional pre-formatted model string (if None, uses _get_full_model_string)
        
        Raises:
            ValueError: If model is None or empty
        """
        # Validate model parameter
        if model is None:
            raise ValueError("model parameter cannot be None")
        if not isinstance(model, str):
            raise TypeError(f"model must be str, got {type(model).__name__}")
        if not model.strip():
            raise ValueError("model parameter cannot be empty or whitespace-only")
        if messages is None:
            raise ValueError("messages parameter cannot be None")
        if not isinstance(messages, list):
            raise TypeError(f"messages must be list, got {type(messages).__name__}")
        
        params = {
            "model": model_string or self._get_full_model_string(model),
            "messages": messages,
            "api_key": self.api_key,
            "base_url": self.base_url,
            "timeout": self.timeout,
        }
        return params

    @abstractmethod
    def _get_full_model_string(self, model_id: str) -> str:
        """
        Constructs the full model string required by LiteLLM.
        
        Args:
            model_id: Model identifier (guaranteed to be non-empty string by caller)
        
        Returns:
            Full model string for LiteLLM (e.g., "anthropic/claude-sonnet-4-5-20250929")
        
        Note:
            model_id is validated by _build_request_params before this is called.
            Subclasses can assume model_id is a valid non-empty string.
        """
        pass

    def _extract_thinking_content(self, delta: Any) -> Optional[str]:
        """
        Extracts reasoning/thinking content from a LiteLLM delta.
        
        Shared implementation for Anthropic, Gemini, and other providers that support
        thinking tokens. Handles multiple formats:
        - Object attributes (reasoning_content, thinking, reasoning, thought)
        - Dictionary values
        - XML tags in content
        
        Args:
            delta: LiteLLM delta object or dictionary
            
        Returns:
            Extracted thinking content as string, or None if not found
        """
        # 1. Handle object attributes (Anthropic/Gemini SDKs)
        content = (
            getattr(delta, "reasoning_content", None)
            or getattr(delta, "thinking", None)
            or getattr(delta, "reasoning", None)
            or getattr(delta, "thought", None)
        )
        
        # 2. Handle dictionary format
        if not content and isinstance(delta, dict):
            content = (
                delta.get("reasoning_content")
                or delta.get("thinking")
                or delta.get("reasoning")
                or delta.get("thought")
            )
        
        # 3. If content is a string, check for XML tags
        if isinstance(content, str):
            # Check for <thinking> tags (compiled once at module load).
            match = THINKING_TAG_PATTERN.search(content)
            if match:
                return match.group(1)
            return content
        
        # 4. If content is a dict, extract text/content
        if isinstance(content, dict):
            text_value = content.get("text") or content.get("content")
            if isinstance(text_value, str):
                return text_value
            return None
        
        return None
