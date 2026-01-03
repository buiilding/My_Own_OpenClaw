"""
Agent Session Factory.

Creates AgentSession instances with all dependencies properly injected.
Separates session creation logic from the Container class.
"""
import logging
import uuid
from typing import TYPE_CHECKING, Any, Optional

from backend.src.core.config import AppConfig

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession
    from backend.src.core.plugins.registry import PluginRegistry
    from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class AgentSessionFactory:
    """
    Factory for creating AgentSession instances with all dependencies.

    Handles the creation of AgentSession instances with proper dependency injection.
    session dependencies, keeping this logic separate from the Container.
    """

    def __init__(
        self,
        config: AppConfig,
        tool_registry: "ToolRegistry",
        plugin_registry: Optional["PluginRegistry"],
        llm_client_factory: Any,  # Callable that returns LLMClient
        tool_orchestrator_factory: Any,  # Callable that returns ToolOrchestrator
        event_bus: Any,  # EventBus instance
    ):
        """
        Initialize the session factory.

        Args:
            config: Application configuration
            tool_registry: Tool registry instance
            plugin_registry: Plugin registry instance (may be None)
            llm_client_factory: Factory function that creates LLMClient instances
            tool_orchestrator_factory: Factory function that creates ToolOrchestrator instances
            event_bus: EventBus instance for event communication
        """
        self.config = config
        self.tool_registry = tool_registry
        self.plugin_registry = plugin_registry
        self.llm_client_factory = llm_client_factory
        self.tool_orchestrator_factory = tool_orchestrator_factory
        self.event_bus = event_bus

    def create_session(
        self,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
    ) -> "AgentSession":
        """
        Create a new AgentSession with all dependencies injected.

        Args:
            user_id: User identifier
            session_id: Optional session identifier (generated if not provided)

        Returns:
            Initialized AgentSession

        Raises:
            RuntimeError: If plugin_registry is not initialized
        """
        if not session_id:
            session_id = str(uuid.uuid4())

        # Create LLM client
        llm_client = self.llm_client_factory()

        # Create ToolOrchestrator
        tool_orchestrator = self.tool_orchestrator_factory()

        # Validate plugin registry is initialized
        if self.plugin_registry is None:
            raise RuntimeError(
                "PluginRegistry not initialized. "
                "Call container.plugin_registry = ... after bootstrap."
            )

        # Create AgentSession
        from backend.src.agent.core import AgentSession

        session = AgentSession(
            cfg=self.config,
            tool_registry=self.tool_registry,
            plugin_registry=self.plugin_registry,
            llm_client=llm_client,
            tool_orchestrator=tool_orchestrator,
            event_bus=self.event_bus,
            user_id=user_id,
            session_id=session_id,
        )

        logger.debug(f"Created AgentSession for user {user_id}, session {session_id}")
        return session
