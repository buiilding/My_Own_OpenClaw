"""
Application Container for dependency injection.

This module provides the main application container using dependency injection composition.
"""

from dependency_injector import containers, providers

from backend.src.core.container.core_container import CoreContainer
from backend.src.core.container.memory_container import MemoryContainer
from backend.src.core.container.tool_container import ToolContainer
from backend.src.core.inference import EmbeddingRouter, OcrRouter, VisionRouter
from backend.src.services.ocr import LocalOcrProvider
from backend.src.services.vision import LocalVisionProvider


class ApplicationContainer(containers.DeclarativeContainer):
    """
    Main application container using dependency injection composition.

    This container orchestrates the entire application's dependency graph using
    domain-driven design principles. It composes specialized containers for
    different functional areas, providing clean separation of concerns and
    improved testability.

    Container Composition:
    - CoreContainer: Foundation services (config, LLM, TTS, core services)
    - ToolContainer: Tool system (registry, orchestrator, loaders)
    - MemoryContainer: Memory system (embeddings, storage, retrieval)

    Key Benefits:
    - Clear dependency boundaries between domains
    - Easy testing through container overrides
    - Runtime reconfiguration capabilities
    - Lazy initialization of expensive resources
    - Centralized dependency management

    Usage:
        container = ApplicationContainer()
        await container.initialize()

        # Access components
        agent = container.agent_session_factory("user123")
        llm_client = container.core.llm_client()
    """

    # Core container (provides config, services, LLM, TTS)
    core = providers.Container(CoreContainer)

    # Tool container (wired to core for config)
    tools = providers.Container(
        ToolContainer,
        config=core.config,
        cache_manager=core.cache_manager,
    )

    # Memory container (wired to core for config and cache_manager)
    memory = providers.Container(
        MemoryContainer,
        config=core.config,
        cache_manager=core.cache_manager,
    )

    ocr_provider = providers.Singleton(
        lambda service, cfg: (
            LocalOcrProvider(service, model_id=cfg.ocr_model)
            if service is not None
            else None
        ),
        service=core.ocr_service,
        cfg=core.config,
    )
    vision_provider = providers.Singleton(
        lambda service: LocalVisionProvider(service) if service is not None else None,
        service=core.vision_service,
    )
    embedding_router = providers.Singleton(
        EmbeddingRouter,
        provider=memory.embedder,
    )
    ocr_router = providers.Singleton(
        OcrRouter,
        provider=ocr_provider,
    )
    vision_router = providers.Singleton(
        VisionRouter,
        provider=vision_provider,
    )

    # API container (will be created and wired in Container facade)
    # Note: Created in Container.__init__ to avoid circular dependency with session_manager

    # Expose commonly used providers at top level for convenience
    config_manager = core.config_manager
    config = core.config
    llm_client = core.llm_client
    tts_service = core.tts_service
    vision_service = core.vision_service
    ocr_service = core.ocr_service
    config_service = core.config_service
    model_service = core.model_service

    agent_factory = tools.agent_factory
    tool_registry = tools.tool_registry
    context_factory = tools.context_factory
    tool_orchestrator = tools.tool_orchestrator

    embedder = memory.embedder
