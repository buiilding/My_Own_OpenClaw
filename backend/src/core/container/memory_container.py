"""
Memory Container for memory-related dependencies.

Contains embedding provider and memory store providers.
"""
import logging

from dependency_injector import containers, providers

from backend.src.core.container.factories import _create_embedder

logger = logging.getLogger(__name__)


class MemoryContainer(containers.DeclarativeContainer):
    """
    Memory system dependency injection container.

    Provides:
    - Embedding provider
    """

    # Wiring - these will be provided by parent container
    config = providers.Dependency()
    cache_manager = providers.Dependency()

    # Memory System Components
    embedder = providers.Singleton(
        lambda cfg, cm: _create_embedder(cfg, cm),
        cfg=config,
        cm=cache_manager,
    )
