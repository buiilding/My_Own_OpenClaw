"""
Agent Session Factory.

Creates AgentSession instances with all dependencies properly injected.
Separates session creation logic from the Container class.
"""
import logging
import uuid
from typing import TYPE_CHECKING, Any, Optional

from backend.src.core.config import AppConfig
from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.core.interfaces.memory_store import MemoryStoreInterface

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession
    from backend.src.core.plugins.registry import PluginRegistry
    from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class AgentSessionFactory:
    """
    Factory for creating AgentSession instances with all dependencies.

    Handles the creation of MemoryManager, retrieval, summarizer, and other
    session dependencies, keeping this logic separate from the Container.
    """

    def __init__(
        self,
        config: AppConfig,
        memory_store: Optional[MemoryStoreInterface],
        embedder: Optional[EmbeddingProvider],
        tool_registry: "ToolRegistry",
        plugin_registry: Optional["PluginRegistry"],
        llm_client_factory: Any,  # Callable that returns LLMClient
        tool_orchestrator_factory: Any,  # Callable that returns ToolOrchestrator
    ):
        """
        Initialize the session factory.

        Args:
            config: Application configuration
            memory_store: Memory store instance (may be None if memory disabled)
            embedder: Embedding provider (may be None if memory disabled)
            tool_registry: Tool registry instance
            plugin_registry: Plugin registry instance (may be None)
            llm_client_factory: Factory function that creates LLMClient instances
            tool_orchestrator_factory: Factory function that creates ToolOrchestrator instances
        """
        self.config = config
        self.memory_store = memory_store
        self.embedder = embedder
        self.tool_registry = tool_registry
        self.plugin_registry = plugin_registry
        self.llm_client_factory = llm_client_factory
        self.tool_orchestrator_factory = tool_orchestrator_factory

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

        # Create Memory Manager Dependencies
        retrieval = None
        summarizer = None

        if self.memory_store and self.config.memory_enabled:
            from backend.src.memory.retrieval import MemorySummarizer, SemanticRetrieval

            retrieval = SemanticRetrieval(self.memory_store, embedder=self.embedder)
            summarizer = MemorySummarizer(
                memory_store=self.memory_store, llm_client=llm_client, cfg=self.config
            )

        # Create MemoryManager
        from backend.src.memory.memory_manager import MemoryManager

        memory_manager = MemoryManager(
            user_id=user_id,
            session_id=session_id,
            memory_store=self.memory_store,
            retrieval=retrieval,
            summarizer=summarizer,
            cfg=self.config,
        )

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
            memory_manager=memory_manager,
            tool_registry=self.tool_registry,
            plugin_registry=self.plugin_registry,
            llm_client=llm_client,
            tool_orchestrator=tool_orchestrator,
            user_id=user_id,
            session_id=session_id,
        )

        logger.debug(f"Created AgentSession for user {user_id}, session {session_id}")
        return session
