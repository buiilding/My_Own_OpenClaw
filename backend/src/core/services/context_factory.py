"""
Context Factory Service.

This module provides a centralized service for creating execution contexts,
eliminating duplication and ensuring consistent context creation across the system.
"""
import os
import time
import logging
from typing import Any, Dict, Optional, TYPE_CHECKING

from backend.src.sdk.context import ToolContext, UserContext, SessionContext, ExecutionRuntime
from backend.src.core.config import AppConfig

if TYPE_CHECKING:
    from backend.src.tools.registry import ToolRegistry
    from backend.src.agent.core import AgentSession

logger = logging.getLogger(__name__)


class ContextFactory:
    """
    Factory for creating execution contexts.
    
    Provides a single source of truth for context creation, ensuring
    consistent service injection and context structure across the system.
    """
    
    def __init__(
        self,
        config: AppConfig,
        tool_registry: Optional["ToolRegistry"] = None,
        tool_loader: Optional[Any] = None,
        session_ref: Optional["AgentSession"] = None,
        agent_factory: Optional[Any] = None,
    ):
        """
        Initialize the context factory.
        
        Args:
            config: Application configuration
            tool_registry: Optional tool registry instance (can be set later)
            tool_loader: Optional tool loader instance (for service access)
            session_ref: Optional session reference (for session-scoped data)
            agent_factory: Optional agent factory instance
        """
        self.config = config
        self.tool_registry = tool_registry
        self.tool_loader = tool_loader
        self.session_ref = session_ref
        self.agent_factory = agent_factory
        self.vision_service: Optional[Any] = None
    
    def set_tool_registry(self, tool_registry: "ToolRegistry") -> None:
        """
        Set the tool registry (for resolving circular dependencies).
        
        Args:
            tool_registry: Tool registry instance
        """
        self.tool_registry = tool_registry

    def set_agent_factory(self, agent_factory: Any) -> None:
        """Set the agent factory."""
        self.agent_factory = agent_factory

    def set_vision_service(self, vision_service: Optional[Any]) -> None:
        """
        Set the vision service (for pre-initialized InternVL model).
        
        Args:
            vision_service: VisionService instance or None
        """
        self.vision_service = vision_service
    
    def create_tool_context(
        self,
        user_id: str,
        session_id: str,
        workspace_root: Optional[str] = None,
        session_ref: Optional["AgentSession"] = None,
        additional_services: Optional[Dict[str, Any]] = None,
    ) -> ToolContext:
        """
        Create a tool execution context.
        
        This is the single source of truth for context creation.
        All context creation should go through this method.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            workspace_root: Optional workspace root path (defaults to current directory)
            session_ref: Optional session reference (overrides factory default)
            additional_services: Optional additional services to inject
            
        Returns:
            Configured ToolContext instance
        """
        # Use provided session_ref or fall back to factory default
        effective_session_ref = session_ref or self.session_ref
        
        # Build services dictionary
        services: Dict[str, Any] = {
            "config": self.config,
        }
        
        # Add tool registry if available
        if self.tool_registry:
            services["tool_registry"] = self.tool_registry
        
        # Add tool loader services if available
        if self.tool_loader:
            if hasattr(self.tool_loader, "services"):
                services["file_service"] = self.tool_loader.services.get_file_service()
                services["workspace_context"] = self.tool_loader.services.get_workspace_context()
                services["storage_service"] = self.tool_loader.services.get_storage_service()
        
        # Add session reference if available (for session-scoped data)
        if effective_session_ref:
            services["session"] = effective_session_ref
        
        # Add tool search engine if available and not None
        if hasattr(self.tool_registry, "tool_search_engine") and self.tool_registry.tool_search_engine is not None:
            services["tool_search_engine"] = self.tool_registry.tool_search_engine
        
        # Add agent factory if available
        if self.agent_factory:
            services["agent_factory"] = self.agent_factory

        # Add vision service if available (pre-initialized InternVL model)
        if self.vision_service:
            services["vision_service"] = self.vision_service

        # Merge additional services
        if additional_services:
            services.update(additional_services)
        
        # Create context
        workspace = workspace_root or os.getcwd()
        
        context = ToolContext(
            user=UserContext(user_id=user_id),
            session=SessionContext(
                session_id=session_id,
                created_at=time.time()
            ),
            runtime=ExecutionRuntime(
                workspace_root=workspace,
                services=services
            )
        )
        
        logger.debug(
            f"Created context for user={user_id}, session={session_id}, "
            f"workspace={context.workspace_root}"
        )
        
        return context
    
    def update_session_ref(self, session_ref: Optional["AgentSession"]) -> None:
        """
        Update the default session reference for this factory.
        
        Args:
            session_ref: New session reference (or None to clear)
        """
        self.session_ref = session_ref
        logger.debug(f"Updated factory session reference: {session_ref.session_id if session_ref else None}")

