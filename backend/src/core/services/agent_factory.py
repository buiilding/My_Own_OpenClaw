"""
Agent Factory Service.

This module provides a factory for creating lightweight, scoped agent sessions (sub-agents)
that share heavy resources (memory, LLM client) with their parent but have restricted
tools and custom personas.
"""
import logging
import uuid
from typing import List, Optional, Any, Dict

from backend.src.agent.core import AgentSession
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
        self.marketplace_tools = parent_registry.marketplace_tools
        self.tool_search_engine = getattr(parent_registry, "tool_search_engine", None)
        self.context_factory = parent_registry.context_factory

    def get_tool(self, name: str) -> Optional[SDKTool]:
        if name not in self.allowed_tools:
            return None
        return self.parent_registry.get_tool(name)

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """Get schemas only for allowed tools."""
        return self.parent_registry.get_function_declarations_filtered(list(self.allowed_tools))
    
    def get_tool_names(self) -> List[str]:
        return list(self.allowed_tools)

    def is_tool_available(self, tool_name: str) -> bool:
        return tool_name in self.allowed_tools and self.parent_registry.is_tool_available(tool_name)
    
    def get_tool_capabilities(self, tool_name: str) -> Optional[Dict[str, Any]]:
        if tool_name not in self.allowed_tools:
            return None
        return self.parent_registry.get_tool_capabilities(tool_name)
    
    async def get_marketplace_tool_instance(self, tool_name: str) -> Optional[SDKTool]:
        if tool_name not in self.allowed_tools:
            return None
        return await self.parent_registry.get_marketplace_tool_instance(tool_name)


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

        # 2. Generate a sub-session ID (or shared? Plan said "scoped history", so new ID)
        # Using a new session ID ensures clear history separation in the database.
        # We append the agent name for traceability.
        sub_session_id = f"{parent_session.session_id}_{name}_{str(uuid.uuid4())[:8]}"

        # 3. Create the Session
        # We reuse MemoryManager but we might need to be careful about 'session_id' in memory.
        # If we want "Shared Memory" (access to same semantic/episodic), we should keep the same session_id?
        # The user asked for "Scoped History" but "Shared Resources".
        # Scoped History usually means "Short-term memory (context window) is fresh".
        # Long-term memory (database) should probably be accessible.
        # If we use a new session_id, `memory_manager` will store memories under that new ID.
        # This seems correct for "Scoped History".
        
        # IMPORTANT: AgentSession.__init__ creates a NEW MemoryManager if we don't pass one?
        # Actually AgentSession takes `memory_manager` as arg.
        # But `memory_manager` has `session_id` stored inside it.
        # If we pass the PARENT's memory_manager, it will log to the PARENT's session_id.
        # If we want scoped history, we should probably create a NEW MemoryManager instance
        # that shares the underlying `MemoryStore` but uses the new `sub_session_id`.
        
        # Let's check MemoryManager init again.
        # It takes `memory_store`, `retrieval`, `summarizer`. These are the heavy, sharable parts.
        from backend.src.memory.memory_manager import MemoryManager
        
        sub_memory_manager = MemoryManager(
            user_id=parent_session.user_id,
            session_id=sub_session_id,
            memory_store=parent_session.memory_manager.memory_store, # Shared DB
            retrieval=parent_session.memory_manager.retrieval,       # Shared Logic
            summarizer=parent_session.memory_manager.summarizer,     # Shared Logic
            cfg=parent_session.cfg
        )

        # 4. Create AgentSession
        sub_session = AgentSession(
            cfg=parent_session.cfg,
            memory_manager=sub_memory_manager,
            tool_registry=restricted_registry, # type: ignore
            llm_client=parent_session.llm_client,
            tool_orchestrator=None, # Will be created by Session if None, using restricted registry
            user_id=parent_session.user_id,
            session_id=sub_session_id
        )

        # 5. Inject System Prompt
        # We need to update PromptConstructor to support this.
        # For now, we'll hack it or update PromptConstructor.
        # Plan implies updating PromptConstructor is fine or doing it here.
        # Let's assume we will update PromptConstructor to have a `system_prompt` attribute.
        sub_session.prompt_builder.system_prompt = system_prompt

        return sub_session

