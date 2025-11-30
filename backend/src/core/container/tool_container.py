"""
Tool Container for tool-related dependencies.

Contains all tool system providers including registry, loader, orchestrator, etc.
"""
import logging

from dependency_injector import containers, providers

from backend.src.core.container.factories import (
    _create_agent_factory,
    _create_tool_instantiator,
    _create_tool_loader,
    _create_tool_orchestrator,
    _create_tool_registry_with_factory,
    _create_tool_search_engine,
)

logger = logging.getLogger(__name__)


class ToolContainer(containers.DeclarativeContainer):
    """
    Tool system dependency injection container.

    Provides:
    - Tool instantiator
    - Tool loader
    - Tool registry
    - Context factory
    - Tool search engine
    - Tool orchestrator
    - Agent factory
    """

    # Wiring - these will be provided by parent container
    config = providers.Dependency()
    service_container = providers.Dependency()

    # Tool System - proper dependency order to avoid circular dependencies:
    # 1. Create instantiator first (tool_search_engine is optional, injected later)
    # 2. Create loader with instantiator
    # 3. Create registry and factory with loader
    # 4. Create search engine with registry
    # 5. Wire search engine into instantiator via DI override (proper DI pattern)

    # Tool Instantiator (created first, search_engine is optional and injected later)
    tool_instantiator = providers.Singleton(
        lambda: _create_tool_instantiator(None),
    )

    # Tool Loader (needs instantiator, injected via DI)
    tool_loader = providers.Singleton(
        lambda cfg, services, instantiator: _create_tool_loader(
            cfg, services, instantiator
        ),
        cfg=config,
        services=service_container,
        instantiator=tool_instantiator,
    )

    # Agent Factory
    agent_factory = providers.Singleton(
        lambda: _create_agent_factory(),
    )

    # Create tool registry and context factory together to resolve circular dependency
    # This factory creates both and wires them together properly
    tool_registry_and_factory = providers.Singleton(
        lambda cfg, loader, af: _create_tool_registry_with_factory(cfg, loader, af),
        cfg=config,
        loader=tool_loader,
        af=agent_factory,
    )

    # Extract registry and factory from the tuple
    tool_registry = providers.Singleton(
        lambda pair: pair[0],
        pair=tool_registry_and_factory,
    )

    context_factory = providers.Singleton(
        lambda pair: pair[1],
        pair=tool_registry_and_factory,
    )

    # Tool Search Engine (created after registry, properly injected)
    tool_search_engine = providers.Singleton(
        lambda registry: _create_tool_search_engine(registry),
        registry=tool_registry,
    )

    # Tool Orchestrator - lazy import to avoid circular dependencies
    tool_orchestrator = providers.Factory(
        lambda registry, cfg, ctx_factory: _create_tool_orchestrator(
            registry, cfg, ctx_factory
        ),
        registry=tool_registry,
        cfg=config,
        ctx_factory=context_factory,
    )
