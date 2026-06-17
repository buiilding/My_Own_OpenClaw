"""
Container Factory Functions.

Factory functions for creating application components.
"""

import logging
import os
from typing import Optional

from backend.src.core.config import AppConfig
from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.embeddings.limited_provider import CapacityLimitedEmbeddingProvider
from backend.src.embeddings.remote_provider import RemoteHttpEmbeddingProvider

logger = logging.getLogger(__name__)


def _create_agent_factory():
    """Create agent factory."""
    from backend.src.core.services.agent_factory import AgentFactory

    return AgentFactory()


def _create_tool_registry_with_factory(config: AppConfig, agent_factory, cache_manager):
    """
    Create tool registry and context factory together.

    Returns:
        Tuple of (ToolRegistry, ContextFactory) properly wired together
    """
    from backend.src.core.services.context_factory import ContextFactory
    from backend.src.tools.registry import ToolRegistry

    # Create context factory first (without registry)
    context_factory = ContextFactory(
        config=config,
        tool_registry=None,  # Will be set after registry is created
        agent_factory=agent_factory,
    )

    # Create tool registry with context factory
    tool_registry = ToolRegistry(
        config=config,
        context_factory=context_factory,
        cache_manager=cache_manager,
    )

    # Wire registry into context factory
    context_factory.set_tool_registry(tool_registry)

    return (tool_registry, context_factory)


def _create_tool_orchestrator(tool_registry, context_factory):
    """Create tool orchestrator."""
    from backend.src.tools.orchestrator import ToolResultOrchestrator

    return ToolResultOrchestrator(tool_registry, context_factory=context_factory)


def _create_local_sentence_transformer_provider(
    config: AppConfig,
    cache_manager,
) -> Optional[EmbeddingProvider]:
    """Create the in-process sentence-transformer provider."""
    try:
        from backend.src.embeddings.embeddings import SentenceTransformerProvider

        # Pick the right device: prefer CUDA if available, fall back to Apple
        # Silicon (MPS) or CPU. This avoids crashing on machines without a GPU
        # (common on macOS) where torch is compiled without CUDA support.
        device = "cpu"
        try:
            import torch

            if torch.cuda.is_available():
                device = "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                device = "mps"
        except Exception:
            # If torch import/probing fails, stay on CPU to keep startup healthy.
            device = "cpu"

        return SentenceTransformerProvider(
            model_name=config.embedding_model,
            device=device,
            cache_manager=cache_manager,
        )
    except ImportError as e:
        logger.error(f"Failed to initialize embedding provider: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create embedding provider: {e}")
        return None


def _wrap_embedding_provider(
    provider: Optional[EmbeddingProvider],
    *,
    config: AppConfig,
    label: str,
) -> Optional[EmbeddingProvider]:
    if provider is None:
        return None
    return CapacityLimitedEmbeddingProvider(
        provider,
        max_concurrent_requests=config.embedding_max_concurrent_requests,
        queue_timeout_seconds=config.embedding_queue_timeout_seconds,
        label=label,
    )


def _create_embedder(config: AppConfig, cache_manager) -> Optional[EmbeddingProvider]:
    """
    Create embedding provider if memory is enabled.

    Args:
        config: Application configuration
        cache_manager: CacheManager instance (injected via DI)
    """
    if not config.memory_enabled:
        return None
    if config.embedding_backend == "disabled":
        return None
    if config.embedding_backend == "local":
        provider = _create_local_sentence_transformer_provider(config, cache_manager)
        return _wrap_embedding_provider(
            provider,
            config=config,
            label="backend-local-embedding",
        )
    if config.embedding_backend == "remote-http":
        if (
            not isinstance(config.embedding_remote_service_url, str)
            or not config.embedding_remote_service_url.strip()
        ):
            logger.error(
                "Embedding backend remote-http requires embedding_remote_service_url"
            )
            return None
        provider = RemoteHttpEmbeddingProvider(
            service_url=config.embedding_remote_service_url,
            model_id=config.embedding_model,
            timeout_seconds=config.embedding_request_timeout_seconds,
        )
        return _wrap_embedding_provider(
            provider,
            config=config,
            label="backend-remote-embedding",
        )
    if config.embedding_backend == "vendor":
        api_key = (
            config.api_key
            or os.getenv(config.embedding_api_key_env)
            or os.getenv("OPENAI_API_KEY")
        )
        if not api_key:
            logger.error(
                "Embedding backend vendor requires %s",
                config.embedding_api_key_env,
            )
            return None
        from backend.src.embeddings.openai_provider import OpenAIEmbeddingProvider

        provider = OpenAIEmbeddingProvider(
            api_key=api_key,
            model_id=config.embedding_model or "text-embedding-3-small",
            timeout_seconds=config.embedding_request_timeout_seconds,
        )
        return _wrap_embedding_provider(
            provider,
            config=config,
            label="backend-vendor-embedding",
        )

    logger.warning(
        "Embedding backend %s is not implemented in-process; disabling embedding provider",
        config.embedding_backend,
    )
    return None


def _create_tts_service(config: AppConfig):
    """Create TTS service."""
    from backend.src.core.services.speech_service_factory import create_speech_service

    return create_speech_service(config)


def _create_vision_service(config: AppConfig):
    """Create vision service with configured model name."""
    if config.vision_backend in {"remote-http", "disabled"}:
        return None
    if config.vision_backend != "local":
        logger.warning(
            "Vision backend %s is not implemented in-process; disabling vision provider",
            config.vision_backend,
        )
        return None
    from backend.src.services.vision import VisionService

    return VisionService(model_name=config.vision_model_name)


def _create_ocr_service(config: AppConfig):
    """Create OCR service with configured settings."""
    if config.ocr_backend in {"remote-http", "disabled"}:
        return None
    if config.ocr_backend != "local":
        logger.warning(
            "OCR backend %s is not implemented in-process; disabling OCR provider",
            config.ocr_backend,
        )
        return None
    from backend.src.services.ocr.ocr_service import OcrService

    return OcrService()


def _create_ocr_provider(config: AppConfig, service=None):
    """Create the configured OCR provider adapter."""
    if config.ocr_backend == "disabled":
        return None
    if config.ocr_backend == "local":
        if service is None:
            return None
        from backend.src.services.ocr.provider import LocalOcrProvider

        return LocalOcrProvider(service, model_id=config.ocr_model)
    if config.ocr_backend == "remote-http":
        if (
            not isinstance(config.ocr_remote_service_url, str)
            or not config.ocr_remote_service_url.strip()
        ):
            logger.error("OCR backend remote-http requires ocr_remote_service_url")
            return None
        from backend.src.services.ocr.remote_provider import RemoteHttpOcrProvider

        return RemoteHttpOcrProvider(
            service_url=config.ocr_remote_service_url,
            health_url=config.ocr_remote_health_url,
            model_id=config.ocr_model,
            request_timeout_seconds=config.ocr_request_timeout_seconds,
            health_timeout_seconds=config.ocr_health_timeout_seconds,
        )

    logger.warning(
        "OCR backend %s is not implemented in-process; disabling OCR provider",
        config.ocr_backend,
    )
    return None


def _create_vision_provider(config: AppConfig, service=None):
    """Create the configured vision provider adapter."""
    if config.vision_backend == "disabled":
        return None
    if config.vision_backend == "local":
        if service is None:
            return None
        from backend.src.services.vision import LocalVisionProvider

        return LocalVisionProvider(service)
    if config.vision_backend == "remote-http":
        if (
            not isinstance(config.vision_remote_service_url, str)
            or not config.vision_remote_service_url.strip()
        ):
            logger.error(
                "Vision backend remote-http requires vision_remote_service_url"
            )
            return None
        from backend.src.services.vision import RemoteHttpVisionProvider

        return RemoteHttpVisionProvider(
            service_url=config.vision_remote_service_url,
            health_url=config.vision_remote_health_url,
            model_id=config.vision_model_name or "remote-vision",
            request_timeout_seconds=config.vision_request_timeout_seconds,
            health_timeout_seconds=config.vision_health_timeout_seconds,
        )

    logger.warning(
        "Vision backend %s is not implemented in-process; disabling vision provider",
        config.vision_backend,
    )
    return None
