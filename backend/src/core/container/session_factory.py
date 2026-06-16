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
    from backend.src.agent.session.session import AgentSession
    from backend.src.core.inference.ocr_router import OcrRouter
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
        ocr_router: Optional["OcrRouter"],
        llm_client_factory: Any,  # Callable that returns LLMClient
        tool_orchestrator_factory: Any,  # Callable that returns ToolOrchestrator
        event_bus: Any,  # EventBus instance
        metrics_service: Any,  # MetricsService instance
    ):
        """
        Initialize the session factory.

        Args:
            config: Application configuration
            tool_registry: Tool registry instance
            ocr_router: OCR router instance (may be None)
            llm_client_factory: Factory function that creates LLMClient instances
            tool_orchestrator_factory: Factory function that creates ToolOrchestrator instances
            event_bus: EventBus instance for event communication
            metrics_service: MetricsService instance for observability
        """
        self.config = config
        self.tool_registry = tool_registry
        self.ocr_router = ocr_router
        self.llm_client_factory = llm_client_factory
        self.tool_orchestrator_factory = tool_orchestrator_factory
        self.event_bus = event_bus
        self.metrics_service = metrics_service

    def create_session(
        self,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
        config: Optional[AppConfig] = None,
    ) -> "AgentSession":
        """
        Create a new AgentSession with all dependencies injected.

        Args:
            user_id: User identifier
            session_id: Optional session identifier (generated if not provided)
            config: Optional configuration override. If provided, uses this instead of factory's config.

        Returns:
            Initialized AgentSession

        """
        if not session_id:
            session_id = str(uuid.uuid4())

        has_config_override = config is not None
        session_config = config if config is not None else self.config

        # Create LLM client with session-specific config only when the caller
        # provided an override; default sessions use the DI provider branch.
        # The factory accepts an optional config parameter:
        # - If config is provided, it creates client with that config (for session-specific config)
        # - Otherwise, it uses DI container's factory (which may be overridden for simulation)
        llm_client = (
            self.llm_client_factory(session_config)
            if has_config_override
            else self.llm_client_factory()
        )
        logger.info(
            f"[Session Factory] Created LLM client with session config: "
            f"model_provider='{session_config.model_provider}', "
            f"selected_model_id='{session_config.selected_model_id}'"
        )

        # Create ToolOrchestrator
        tool_orchestrator = self.tool_orchestrator_factory()

        # Create AgentSession
        from backend.src.agent.session.session import AgentSession

        session = AgentSession(
            cfg=session_config,
            tool_registry=self.tool_registry,
            ocr_router=self.ocr_router,
            llm_client=llm_client,
            llm_client_factory=self.llm_client_factory,
            tool_orchestrator=tool_orchestrator,
            event_bus=self.event_bus,
            metrics_service=self.metrics_service,
            user_id=user_id,
            session_id=session_id,
        )

        logger.debug(f"Created AgentSession for user {user_id}, session {session_id}")
        return session
