"""
Agent Factory Service.

This module provides a factory for creating lightweight, scoped agent sessions (sub-agents)
that share heavy resources (LLM client) with their parent but have restricted
tools and custom personas.
"""
import logging
import uuid
from typing import List, Optional, Any, Dict

from backend.src.agent.session.session import AgentSession
from backend.src.tools.registry import ToolRegistry
from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)

class RestrictedToolRegistry:
    """
    A lightweight wrapper around a parent ToolRegistry that filters available tools.
    Duck-typed to behave like ToolRegistry.
    """
    def __init__(self, parent_registry: ToolRegistry, allowed_tools: List[str]):
        self.parent_registry = parent_registry
        self.allowed_tools = set(allowed_tools)
        # Copy other attributes that might be accessed
        self.context_factory = parent_registry.context_factory

    def get_tool(self, name: str) -> Optional[SDKTool]:
        if name not in self.allowed_tools:
            return None
        return self.parent_registry.get_tool(name)

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """Get schemas only for allowed tools."""
        return self.parent_registry.get_function_declarations_filtered(list(self.allowed_tools))
    
    def get_tool_names(self) -> List[str]:
        return sorted(list(self.allowed_tools))

    def is_tool_available(self, tool_name: str) -> bool:
        return tool_name in self.allowed_tools and self.parent_registry.is_tool_available(tool_name)
    
    def get_tool_capabilities(self, tool_name: str) -> Optional[Dict[str, Any]]:
        if tool_name not in self.allowed_tools:
            return None
        return self.parent_registry.get_tool_capabilities(tool_name)


class AgentFactory:
    """
    Factory for creating sub-agents (scoped AgentSessions).
    """
    def create_agent(
        self,
        name: str,
        system_prompt: str,
        parent_session: AgentSession,
        tools: Optional[List[str]] = None,
    ) -> AgentSession:
        """
        Create a new sub-agent session sharing resources with the parent.

        Args:
            name: Name of the sub-agent (for logging/identity)
            system_prompt: Custom system prompt for the agent's persona
            parent_session: The parent AgentSession to inherit resources from
            tools: List of allowed tool names. If None, no tools are allowed.

        Returns:
            A new, configured AgentSession ready to run.
        """
        logger.info(f"Creating sub-agent '{name}' from session {parent_session.session_id}")

        # 1. Create Restricted Registry
        allowed_tools = tools or []
        restricted_registry = RestrictedToolRegistry(parent_session.tool_registry, allowed_tools)

        # 2. Generate a sub-session ID
        sub_session_id = f"{parent_session.session_id}_{name}_{str(uuid.uuid4())[:8]}"

        # 3. Get plugin registry from parent session
        # Sub-agents share the same plugin registry to ensure consistent behavior
        plugin_registry = parent_session.plugin_registry

        # 4. Create AgentSession
        sub_session = AgentSession(
            cfg=parent_session.cfg,
            tool_registry=restricted_registry, # type: ignore
            plugin_registry=plugin_registry,
            llm_client=parent_session.llm_client,
            tool_orchestrator=parent_session.tool_orchestrator,
            event_bus=parent_session.event_bus,
            user_id=parent_session.user_id,
            session_id=sub_session_id
        )

        # 5. Inject System Prompt
        # Update PromptConstructor to use the custom system prompt for this agent
        sub_session.prompt_builder.system_prompt = system_prompt

        return sub_session
