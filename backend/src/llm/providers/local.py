import asyncio
import logging
import weakref
from abc import abstractmethod
from typing import AsyncGenerator, Dict, List, Optional

import httpx
import litellm
from litellm import exceptions as litellm_exceptions

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
from backend.src.core.infrastructure.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.types.schemas import (
    LLMMessage,
    NormalizedLLMResponse,
)
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)

# Placeholder API key for local providers that require it for LiteLLM compatibility
# Local providers (Ollama, LM Studio) don't use real API keys, but LiteLLM may
# require a non-None value for certain API compatibility checks
LOCAL_PROVIDER_PLACEHOLDER_API_KEY = "placeholder"


class LocalLLMProvider(LLMProvider):
    """Base provider for local LLMs like Ollama and LMStudio."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, timeout: float = 60.0):
        """
        Initialize local provider with shared HTTP client.
        
        PERFORMANCE: Creates a shared httpx.AsyncClient to enable connection
        pooling and keep-alive, preventing connection churn on repeated requests.
        
        RESOURCE MANAGEMENT: Registers a finalizer to ensure HTTP clients are
        closed when providers are evicted from cache and garbage collected.
        """
        super().__init__(api_key=api_key, base_url=base_url, timeout=timeout)
        self._http_client: Optional[httpx.AsyncClient] = None
        self._http_client_loop: Optional[asyncio.AbstractEventLoop] = None
        # Register finalizer to clean up HTTP client on garbage collection
        # The finalizer will be called when 'self' is about to be garbage collected
        weakref.finalize(self, LocalLLMProvider._cleanup_http_client_finalizer, weakref.ref(self))

    async def _get_http_client(self) -> httpx.AsyncClient:
        """
        Get or create shared HTTP client for this provider instance.
        
        PERFORMANCE: Reuses a single client to enable connection pooling
        and keep-alive, reducing latency and preventing file descriptor exhaustion.
        """
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=self.timeout)
            # Store event loop for cleanup finalizer
            try:
                self._http_client_loop = asyncio.get_running_loop()
            except RuntimeError:
                # No running loop, finalizer will handle cleanup if possible
                self._http_client_loop = None
        return self._http_client

    async def _close_http_client(self) -> None:
        """Close the shared HTTP client if it exists."""
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None
            self._http_client_loop = None

    @staticmethod
    def _cleanup_http_client_finalizer(provider_weakref: weakref.ref) -> None:
        """
        Synchronous cleanup callback for weakref.finalize.
        
        Schedules async cleanup on the stored event loop to close HTTP clients
        when providers are evicted from cache and garbage collected.
        
        This prevents resource leaks (TCP connections, file descriptors) when
        lru_cache evicts provider instances.
        
        Args:
            provider_weakref: Weak reference to the provider instance
        """
        provider = provider_weakref()
        if provider is None:
            return
        
        client = provider._http_client
        if client is None:
            return
        
        # Try to get the event loop
        loop = provider._http_client_loop
        if loop is None:
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                # No event loop available, log warning
                logger.warning(
                    "Could not clean up HTTP client: no event loop available. Resource leak possible."
                )
                return
        
        # Schedule async cleanup on the loop
        if loop.is_running():
            # Create a task to close the client
            async def cleanup():
                try:
                    await client.aclose()
                except Exception as e:
                    logger.debug(f"Error closing HTTP client in finalizer: {e}")
            
            # Schedule cleanup task (fire and forget)
            try:
                loop.create_task(cleanup())
            except RuntimeError:
                # Loop is closing, can't schedule tasks
                logger.debug("Could not schedule HTTP client cleanup: event loop is closing")
        else:
            # Loop is not running, try to run cleanup synchronously
            # This is a fallback but may not work if loop is closed
            try:
                if loop.is_closed():
                    logger.debug("Event loop is closed, cannot clean up HTTP client")
                    return
                loop.run_until_complete(client.aclose())
            except Exception as e:
                logger.debug(f"Error running HTTP client cleanup: {e}")

    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        params = self._build_request_params(model, messages)
        try:
            response = await litellm.acompletion(**params)
            if (
                not response
                or not response.choices
                or not response.choices[0].message
            ):
                raise LLMAPIError(
                    f"Invalid response from {self._provider_name()}",
                    model=model
                )
            content = response.choices[0].message.content or ""
            return {"content": content}
        except litellm_exceptions.RateLimitError as e:
            raise LLMRateLimitError(
                f"{self._provider_name()} rate limit exceeded",
                model=model,
                cause=e
            )
        except litellm_exceptions.APIError as e:
            raise LLMAPIError(
                f"{self._provider_name()} API error",
                model=model,
                cause=e
            )
        except Exception as e:
            raise LLMError(
                f"An unexpected error occurred with {self._provider_name()}",
                model=model,
                cause=e
            )

    async def _stream_internal(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Internal streaming implementation for local providers.
        Exceptions bubble up to base class for uniform error handling.
        """
        params = self._build_request_params(model, messages)
        params["stream"] = True
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            if chunk and chunk.choices and chunk.choices[0].delta:
                content = chunk.choices[0].delta.content
                if content:
                    yield ChunkEvent(content=content)

    def _build_request_params(self, model: str, messages: List[LLMMessage]) -> dict:
        params = super()._build_request_params(model, messages)
        # Local models often need to be told they are compatible with OpenAI's API
        params["custom_llm_provider"] = "openai"
        if not params.get("api_key"):
            params["api_key"] = LOCAL_PROVIDER_PLACEHOLDER_API_KEY
        return params

    @abstractmethod
    def _provider_name(self) -> str:
        """Return the provider name for error messages."""
        pass


class OllamaProvider(LocalLLMProvider):
    """Provider for Ollama models."""

    def __init__(self, base_url: str, timeout: float = 60.0):
        """
        Initialize Ollama provider.
        
        Args:
            base_url: Base URL for Ollama API (e.g., "http://localhost:11434")
            timeout: Request timeout in seconds
        """
        # API key is not needed for Ollama
        super().__init__(api_key=None, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """Validate that base_url is provided."""
        if not self.base_url:
            raise ValueError("OllamaProvider requires a valid 'base_url'.")

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("ollama/"):
            return model_id
        return f"ollama/{model_id}"

    def _provider_name(self) -> str:
        return "Ollama"

    async def list_models(self) -> List[Dict[str, str]]:
        """
        Fetch models from Ollama.
        
        PERFORMANCE: Uses shared HTTP client to enable connection pooling
        and keep-alive, preventing connection churn on repeated calls.
        
        Uses the provider's configured timeout instead of a hardcoded value.
        Listing models can trigger model loading/swapping in Ollama, so a longer
        timeout is often needed compared to inference requests.
        """
        models = []
        # base_url is guaranteed to be a string (validated in __init__)
        # Handle the fact that config base_url usually ends in /v1 but api/tags is at root
        base_url = self.base_url
        # Safely remove /v1 suffix if present
        if base_url.endswith("/v1"):
            base_url = base_url.removesuffix("/v1")
            # Handle edge case where base_url was exactly "/v1" - use default localhost
            if not base_url or base_url == "/":
                base_url = "http://localhost:11434"
        
        # Ensure we have a valid base URL before constructing the endpoint
        if not base_url or base_url == "/":
            logger.warning("Invalid Ollama base_url, cannot list models")
            return models
        
        url = f"{base_url.rstrip('/')}/api/tags"
        
        try:
            # Use shared HTTP client for connection pooling
            client = await self._get_http_client()
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                if "models" in data:
                    for model in data["models"]:
                        model_name = model.get("name", "")
                        if model_name:
                            models.append({
                                "id": model_name,
                                "provider": "ollama",
                                "display_name": model_name,
                            })
            else:
                logger.warning(f"Ollama list models failed: {response.status_code}")
        except Exception as e:
            logger.warning(f"Error listing Ollama models: {e}")
            
        return models


class LMStudioProvider(LocalLLMProvider):
    """Provider for LMStudio models."""

    def __init__(self, base_url: str, timeout: float = 60.0):
        """
        Initialize LMStudio provider.
        
        Args:
            base_url: Base URL for LMStudio API (e.g., "http://localhost:1234/v1")
            timeout: Request timeout in seconds
        """
        # API key is not needed for LMStudio
        super().__init__(api_key=None, base_url=base_url, timeout=timeout)

    def _validate_dependencies(self) -> None:
        """Validate that base_url is provided."""
        if not self.base_url:
            raise ValueError("LMStudioProvider requires a valid 'base_url'.")

    def _get_full_model_string(self, model_id: str) -> str:
        if model_id.startswith("lmstudio/"):
            return model_id
        return f"lmstudio/{model_id}"

    def _provider_name(self) -> str:
        return "LMStudio"

    async def list_models(self) -> List[Dict[str, str]]:
        """
        Fetch models from LM Studio.
        
        PERFORMANCE: Uses shared HTTP client to enable connection pooling
        and keep-alive, preventing connection churn on repeated calls.
        
        Uses the provider's configured timeout instead of a hardcoded value.
        Listing models can take longer if the backend is under load.
        """
        models = []
        # base_url is guaranteed to be a string (validated in __init__)
        # Config base_url usually includes /v1, which is what we want for /models
        url = f"{self.base_url.rstrip('/')}/models"
        
        try:
            # Use shared HTTP client for connection pooling
            client = await self._get_http_client()
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                if "data" in data:
                    for model in data["data"]:
                        model_id = model.get("id", "")
                        if model_id:
                            models.append({
                                "id": model_id,
                                "provider": "lmstudio",
                                "display_name": model_id,
                            })
                else:
                    logger.warning(f"LM Studio list models failed: {response.status_code}")
        except Exception as e:
            logger.warning(f"Error listing LM Studio models: {e}")
            
        return models
