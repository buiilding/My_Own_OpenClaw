"""
Container Factory Functions.

Factory functions for creating application components.
"""
import logging
from typing import Optional

from backend.src.core.config import AppConfig
from backend.src.core.interfaces.embedding import EmbeddingProvider

logger = logging.getLogger(__name__)


def _create_agent_factory():
    """Create agent factory."""
    from backend.src.core.services.agent_factory import AgentFactory

    return AgentFactory()


def _create_tool_registry_with_factory(config: AppConfig, agent_factory):
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
    )

    # Wire registry into context factory
    context_factory.set_tool_registry(tool_registry)

    return (tool_registry, context_factory)


def _create_tool_orchestrator(tool_registry, config: AppConfig, context_factory):
    """Create tool orchestrator."""
    from backend.src.tools.orchestrator import ToolOrchestrator

    return ToolOrchestrator(tool_registry, config, context_factory=context_factory)


def _create_embedder(config: AppConfig, cache_manager) -> Optional[EmbeddingProvider]:
    """
    Create embedding provider if memory is enabled.
    
    Args:
        config: Application configuration
        cache_manager: CacheManager instance (injected via DI)
    """
    if not config.memory_enabled:
        return None

    try:
        from backend.src.embeddings.embeddings import SentenceTransformerProvider

        # Create provider without loading model (deferred to async initialize())
        # CacheManager is injected via DI to avoid global state dependency
        return SentenceTransformerProvider(
            model_name=config.embedding_model,
            device="cuda",
            cache_manager=cache_manager,
        )
    except ImportError as e:
        logger.error(f"Failed to initialize embedding provider: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create embedding provider: {e}")
        return None


def _create_tts_service(config: AppConfig):
    """Create TTS service."""
    from backend.src.core.services.tts_service import TTSService

    return TTSService(config)


def _create_vision_service(config: AppConfig):
    """Create vision service with configured model name."""
    from backend.src.services.vision import VisionService

    return VisionService(model_name=config.vision_model_name)
