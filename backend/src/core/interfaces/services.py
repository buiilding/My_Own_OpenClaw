"""
Service Interface Definitions.

This module defines Protocol interfaces for major service components,
providing clear contracts and enabling easy swapping of implementations.
"""
from typing import Any, AsyncGenerator, Dict, List, Optional, Protocol
from backend.src.core.types import LLMMessage


class IMemoryService(Protocol):
    """
    Memory service interface for storing and retrieving memories.
    
    Provides a high-level interface for memory operations, abstracting
    away the details of storage and retrieval implementations.
    """
    
    async def store_episodic_memory(
        self, 
        user_id: str, 
        session_id: str,
        user_message: str, 
        assistant_response: str
    ) -> str:
        """
        Store an episodic memory (conversation turn).
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            user_message: User's message
            assistant_response: Assistant's response
            
        Returns:
            Memory ID string
        """
        ...
    
    async def summarize_and_store_semantic_memory(
        self, 
        user_id: str, 
        session_id: str
    ) -> int:
        """
        Summarize recent episodic memories and store as semantic memory.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            
        Returns:
            Number of semantic memories created
        """
        ...
    
    def retrieve_memories(
        self, 
        user_id: str,
        query: str, 
        limit: int = 5
    ) -> Dict[str, List[str]]:
        """
        Retrieve relevant memories for a query.
        
        Args:
            user_id: User identifier
            query: Search query
            limit: Maximum number of results per type
            
        Returns:
            Dictionary with 'semantic' and 'episodic' keys containing memory text lists
        """
        ...
    
    def format_context(
        self, 
        memories: Dict[str, List[str]]
    ) -> str:
        """
        Format memories into a string for LLM context.
        
        Args:
            memories: Dictionary with 'semantic' and 'episodic' keys
            
        Returns:
            Formatted context string
        """
        ...


class ILLMService(Protocol):
    """
    LLM service interface for language model interactions.
    
    Provides a unified interface for different LLM providers,
    abstracting away provider-specific details.
    """
    
    async def get_completion(
        self, 
        model: str, 
        messages: List[LLMMessage]
    ) -> str:
        """
        Get a completion from the LLM.
        
        Args:
            model: Model identifier
            messages: List of messages (system, user, assistant)
            
        Returns:
            Completion text
        """
        ...
    
    async def get_completion_stream(
        self, 
        model: str, 
        messages: List[LLMMessage]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Get a streaming completion from the LLM.
        
        Args:
            model: Model identifier
            messages: List of messages
            
        Yields:
            Streaming chunks with 'type' and 'content' keys
        """
        ...


class IToolService(Protocol):
    """
    Tool service interface for tool execution and management.
    
    Provides a high-level interface for tool operations, abstracting
    away registry and execution details.
    """
    
    async def execute_tool(
        self, 
        tool_name: str, 
        parameters: Dict[str, Any],
        user_id: str = "default_user",
        session_id: str = "default_session"
    ) -> Dict[str, Any]:
        """
        Execute a tool by name.
        
        Args:
            tool_name: Name of the tool to execute
            parameters: Tool parameters dictionary
            user_id: User identifier
            session_id: Session identifier
            
        Returns:
            Tool execution result dictionary
        """
        ...
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get list of available tools with their schemas.
        
        Returns:
            List of tool metadata dictionaries
        """
        ...
    
    def is_tool_available(self, tool_name: str) -> bool:
        """
        Check if a tool is available.
        
        Args:
            tool_name: Name of the tool
            
        Returns:
            True if tool is available, False otherwise
        """
        ...
    
    def get_tool_schema(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """
        Get JSON schema for a tool.
        
        Args:
            tool_name: Name of the tool
            
        Returns:
            Tool schema dictionary or None if not found
        """
        ...


class ISessionService(Protocol):
    """
    Session service interface for managing user sessions.
    
    Provides a high-level interface for session lifecycle management.
    """
    
    async def get_or_create_session(
        self, 
        user_id: str
    ) -> Any:  # AgentSession - avoid circular import
        """
        Get existing session or create a new one.
        
        Args:
            user_id: User identifier
            
        Returns:
            AgentSession instance
        """
        ...
    
    async def end_session(self, user_id: str) -> None:
        """
        End a user session and perform cleanup.
        
        Args:
            user_id: User identifier
        """
        ...
    
    async def update_all_sessions_config(self, config: Any) -> None:
        """
        Update configuration for all active sessions.
        
        Args:
            config: New AppConfig instance
        """
        ...


class IContextService(Protocol):
    """
    Context service interface for creating execution contexts.
    
    Provides a unified interface for context creation, ensuring
    consistent service injection across the system.
    """
    
    def create_tool_context(
        self,
        user_id: str,
        session_id: str,
        workspace_root: Optional[str] = None,
        session_ref: Optional[Any] = None,
        additional_services: Optional[Dict[str, Any]] = None,
    ) -> Any:  # Context - avoid circular import
        """
        Create a tool execution context.
        
        Args:
            user_id: User identifier
            session_id: Session identifier
            workspace_root: Optional workspace root path
            session_ref: Optional session reference
            additional_services: Optional additional services to inject
            
        Returns:
            Context instance
        """
        ...

