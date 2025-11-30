"""
Container Factory Functions.

Factory functions for creating application components.
"""
import logging
from typing import Optional

from backend.src.core.config import AppConfig
from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.core.interfaces.memory_store import MemoryStoreInterface

logger = logging.getLogger(__name__)


def _create_service_container(config: AppConfig):
    """Create service container."""
    from backend.src.core.services import ServiceContainer

    return ServiceContainer(config)


def _create_tool_instantiator(tool_search_engine):
    """Create tool instantiator with proper DI."""
    from backend.src.tools.loading.tool_instantiator import ToolInstantiator

    return ToolInstantiator(tool_search_engine=tool_search_engine)


def _create_tool_loader(config: AppConfig, service_container, tool_instantiator):
    """Create tool loader with lazy import and proper DI."""
    from backend.src.tools.loader import ToolLoader

    return ToolLoader(
        config,
        service_container=service_container,
        tool_instantiator=tool_instantiator,
    )


def _create_agent_factory():
    """Create agent factory."""
    from backend.src.core.services.agent_factory import AgentFactory

    return AgentFactory()


def _create_tool_registry_with_factory(config: AppConfig, tool_loader, agent_factory):
    """
    Create tool registry and context factory together.

    This factory function resolves the circular dependency by creating both
    objects and wiring them together in a single operation.

    Returns:
        Tuple of (ToolRegistry, ContextFactory) properly wired together
    """
    from backend.src.core.services.context_factory import ContextFactory
    from backend.src.tools.registry import ToolRegistry

    # Create context factory first (without registry)
    context_factory = ContextFactory(
        config=config,
        tool_registry=None,  # Will be set after registry is created
        tool_loader=tool_loader,
        agent_factory=agent_factory,
    )

    # Create tool registry with context factory
    tool_registry = ToolRegistry(
        config=config,
        tool_loader=tool_loader,
        context_factory=context_factory,
    )

    # Wire registry into context factory (complete the circular reference)
    context_factory.set_tool_registry(tool_registry)

    return (tool_registry, context_factory)


def _create_tool_orchestrator(tool_registry, config: AppConfig, context_factory):
    """Create tool orchestrator with lazy import."""
    from backend.src.tools.orchestrator import ToolOrchestrator

    return ToolOrchestrator(tool_registry, config, context_factory=context_factory)


def _create_tool_search_engine(tool_registry):
    """Create tool search engine if available."""
    try:
        from backend.src.tools.marketplace.search import ToolSearchEngine

        engine = ToolSearchEngine(tool_registry)
        # Update registry with search engine if it has the attribute
        if hasattr(tool_registry, "tool_search_engine"):
            tool_registry.tool_search_engine = engine
        return engine
    except ImportError:
        return None


def _create_embedder(config: AppConfig) -> Optional[EmbeddingProvider]:
    """Create embedding provider if memory is enabled."""
    if not config.memory_enabled:
        return None

    try:
        from backend.src.memory.embeddings import SentenceTransformerProvider

        return SentenceTransformerProvider(
            model_name=config.embedding_model, device="cuda"
        )
    except ImportError as e:
        logger.error(f"Failed to initialize embedding provider: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create embedding provider: {e}")
        return None


def _create_memory_store(
    config: AppConfig, embedder: Optional[EmbeddingProvider]
) -> Optional[MemoryStoreInterface]:
    """Create memory store if memory is enabled."""
    if not config.memory_enabled or embedder is None:
        return None

    try:
        from backend.src.core.config import get_config_dir
        from backend.src.memory.storage.local_store import LocalMemoryStore

        # Determine DB path
        db_path = config.memory_db_path
        if db_path is None:
            config_dir = get_config_dir()
            memory_dir = config_dir / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(memory_dir / "memories.db")

        return LocalMemoryStore(db_path=db_path, embedder=embedder)
    except ImportError as e:
        logger.error(f"Failed to initialize memory store: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create memory store: {e}")
        return None


def _create_tts_service(config: AppConfig):
    """Create TTS service."""
    from backend.src.core.services.tts_service import TTSService

    return TTSService(config)
