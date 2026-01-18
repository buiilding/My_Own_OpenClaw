from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional
import logging

import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events import StreamingEvent, ErrorEvent
from backend.src.core.types import LLMMessage, NormalizedLLMResponse

logger = logging.getLogger(__name__)


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
        """Gets a completion from the LLM and returns a normalized response."""
        pass

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Public streaming method with uniform error handling.
        
        All providers must yield events, never raise exceptions.
        This ensures Liskov Substitution Principle compliance.
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
            model: Model identifier
            messages: List of messages
            model_string: Optional pre-formatted model string (if None, uses _get_full_model_string)
        """
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
        """Constructs the full model string required by LiteLLM."""
        pass
