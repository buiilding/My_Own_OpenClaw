"""
Memory Container for memory-related dependencies.

Contains embedding provider and memory store providers.
"""
import logging

from dependency_injector import containers, providers

from backend.src.core.container.factories import _create_embedder, _create_memory_store

logger = logging.getLogger(__name__)


class MemoryContainer(containers.DeclarativeContainer):
    """
    Memory system dependency injection container.

    Provides:
    - Embedding provider
    - Memory store
    """

    # Wiring - these will be provided by parent container
    config = providers.Dependency()

    # Memory System Components
    embedder = providers.Singleton(
        lambda cfg: _create_embedder(cfg),
        cfg=config,
    )

    memory_store = providers.Singleton(
        lambda cfg, emb: _create_memory_store(cfg, emb),
        cfg=config,
        emb=embedder,
    )
