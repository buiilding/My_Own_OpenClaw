import asyncio
import logging
import weakref
from abc import abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
import litellm

from backend.src.core.events.streaming_events import ChunkEvent, StreamingEvent
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
        self._http_client_lock = asyncio.Lock()
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
            async with self._http_client_lock:
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
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
    ) -> NormalizedLLMResponse:
        params = self._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
        )
        return await self._get_completion_with_standard_errors(
            provider_label=self._provider_name(),
            model=model,
            params=params,
        )

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
    ) -> AsyncGenerator[StreamingEvent, None]:
        """
        Internal streaming implementation for local providers.
        Exceptions bubble up to base class for uniform error handling.
        """
        params = self._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
        )
        params["stream"] = True
        params["stream_options"] = {"include_usage": True}
        stream = await litellm.acompletion(**params)
        async for chunk in stream:
            self._record_stream_usage_from_chunk(chunk)
            delta = self._extract_stream_delta(chunk)
            content = self._extract_delta_content(delta)
            if content:
                yield ChunkEvent(content=content)

    @staticmethod
    def _normalize_listed_models(
        raw_models: object,
        *,
        model_id_key: str,
        provider_name: str,
    ) -> List[Dict[str, str]]:
        """Normalize provider model listing payload rows."""
        if not isinstance(raw_models, list):
            return []

        models: List[Dict[str, str]] = []
        for model in raw_models:
            if not isinstance(model, dict):
                continue
            raw_model_id = model.get(model_id_key, "")
            if not isinstance(raw_model_id, str):
                continue
            model_id = raw_model_id.strip()
            if not model_id:
                continue
            models.append({
                "id": model_id,
                "provider": provider_name,
                "display_name": model_id,
            })
        return models

    async def _list_models_from_json_endpoint(
        self,
        *,
        url: str,
        provider_label: str,
        provider_name: str,
        models_field: str,
        model_id_key: str,
    ) -> List[Dict[str, str]]:
        """List models from an HTTP endpoint that returns object JSON payloads."""
        try:
            client = await self._get_http_client()
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning(f"{provider_label} list models failed: {response.status_code}")
                return []

            data = response.json()
            if not isinstance(data, dict):
                logger.warning(f"{provider_label} list models returned non-object JSON payload")
                return []

            raw_models = data.get(models_field, [])
            models = self._normalize_listed_models(
                raw_models,
                model_id_key=model_id_key,
                provider_name=provider_name,
            )
            if not isinstance(raw_models, list):
                logger.warning(
                    f"{provider_label} list models returned non-list '{models_field}' field"
                )
            return models
        except Exception as e:
            logger.warning(f"Error listing {provider_label} models: {e}")
            return []

    def _build_request_params(
        self,
        model: str,
        messages: List[LLMMessage],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        parallel_tool_calls: Optional[bool] = None,
    ) -> dict:
        params = super()._build_request_params(
            model,
            messages,
            tools=tools,
            tool_choice=tool_choice,
            parallel_tool_calls=parallel_tool_calls,
        )
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

    @staticmethod
    def _build_tags_url(base_url: str) -> Optional[str]:
        """
        Build Ollama /api/tags endpoint URL from configured base URL.
        
        Handles config values that include /v1 and edge-case '/v1' paths.
        """
        normalized = base_url
        if normalized.endswith("/v1"):
            normalized = normalized.removesuffix("/v1")
            if not normalized or normalized == "/":
                normalized = "http://localhost:11434"

        if not normalized or normalized == "/":
            return None

        return f"{normalized.rstrip('/')}/api/tags"

    async def list_models(self) -> List[Dict[str, str]]:
        """
        Fetch models from Ollama.
        
        PERFORMANCE: Uses shared HTTP client to enable connection pooling
        and keep-alive, preventing connection churn on repeated calls.
        
        Uses the provider's configured timeout instead of a hardcoded value.
        Listing models can trigger model loading/swapping in Ollama, so a longer
        timeout is often needed compared to inference requests.
        """
        # base_url is guaranteed to be a string (validated in __init__)
        url = self._build_tags_url(self.base_url)
        if url is None:
            logger.warning("Invalid Ollama base_url, cannot list models")
            return []

        return await self._list_models_from_json_endpoint(
            url=url,
            provider_label="Ollama",
            provider_name="ollama",
            models_field="models",
            model_id_key="name",
        )


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
        # base_url is guaranteed to be a string (validated in __init__)
        # Config base_url usually includes /v1, which is what we want for /models
        url = f"{self.base_url.rstrip('/')}/models"

        return await self._list_models_from_json_endpoint(
            url=url,
            provider_label="LM Studio",
            provider_name="lmstudio",
            models_field="data",
            model_id_key="id",
        )
