"""
Tool Container for tool-related dependencies.

Contains all tool system providers including registry, loader, orchestrator, etc.
"""
import logging

from dependency_injector import containers, providers

from backend.src.core.container.factories import (
    _create_agent_factory,
    _create_tool_orchestrator,
    _create_tool_registry_with_factory,
)

logger = logging.getLogger(__name__)


class ToolContainer(containers.DeclarativeContainer):
    """
    Tool system dependency injection container.

    Provides:
    - Tool registry
    - Context factory
    - Tool orchestrator
    - Agent factory
    """

    # Wiring - these will be provided by parent container
    config = providers.Dependency()
    cache_manager = providers.Dependency()

    # Agent Factory
    agent_factory = providers.Singleton(
        lambda: _create_agent_factory(),
    )

    # Create tool registry and context factory together to resolve circular dependency
    # This factory creates both and wires them together properly
    tool_registry_and_factory = providers.Singleton(
        lambda cfg, af, cm: _create_tool_registry_with_factory(cfg, af, cm),
        cfg=config,
        af=agent_factory,
        cm=cache_manager,
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

    # Tool Orchestrator - lazy import to avoid circular dependencies
    tool_orchestrator = providers.Factory(
        lambda registry, cfg, ctx_factory: _create_tool_orchestrator(
            registry, cfg, ctx_factory
        ),
        registry=tool_registry,
        cfg=config,
        ctx_factory=context_factory,
    )
