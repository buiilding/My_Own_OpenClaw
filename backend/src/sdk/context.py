"""
SDK Context Classes.

This module defines the execution context passed to all tools.
It separates 'Identity' (User/Session) from 'Capabilities' (Runtime Services).
"""
from typing import Any, Dict, Optional, Protocol, List
from dataclasses import dataclass, field

# --- Interfaces ---

class AgentSessionInterface(Protocol):
    """Protocol for the AgentSession object (to avoid circular imports)."""
    async def process_query(self, query: str) -> Any: ...

class AgentFactoryInterface(Protocol):
    """Protocol for the AgentFactory service."""
    def create_agent(
        self, 
        name: str, 
        system_prompt: str, 
        parent_session: Any, 
        tools: Optional[List[str]] = None
    ) -> AgentSessionInterface: ...

# --- Data Objects (Identity) ---

@dataclass
class UserContext:
    """Identity: Who is performing the action?"""
    user_id: str
    username: Optional[str] = None
    permissions: list[str] = field(default_factory=list)

@dataclass
class SessionContext:
    """Identity: In what context is this happening?"""
    session_id: str
    created_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)

# --- Runtime Object (Capabilities) ---

@dataclass
class ExecutionRuntime:
    """
    Capabilities: What can the tool do?
    
    This object holds references to services and the environment.
    It is separated from the "Identity" data.
    """
    workspace_root: str
    services: Dict[str, Any] = field(default_factory=dict)

    @property
    def agents(self) -> Optional[AgentFactoryInterface]:
        """Access the AgentFactory service."""
        return self.services.get("agent_factory")

    @property
    def file_service(self) -> Optional[Any]:
        """Access file system services."""
        return self.services.get("file_service")

# --- The Context Object (The Container) ---

@dataclass
class ToolContext:
    """
    The container passed to `tool.run(args, ctx)`.
    
    It combines Identity (User/Session) with Runtime Capabilities.
    Renamed from 'Context' to 'ToolContext' for clarity.
    """
    user: UserContext
    session: SessionContext
    runtime: ExecutionRuntime
    
    # Shortcuts for backward compatibility or ease of use
    @property
    def workspace_root(self) -> str:
        return self.runtime.workspace_root
        
    @property
    def services(self) -> Dict[str, Any]:
        return self.runtime.services

    @property
    def agents(self) -> Optional[AgentFactoryInterface]:
        return self.runtime.agents

    @property
    def is_interactive(self) -> bool:
        return True

# Alias for backward compatibility during refactor (optional, but good for transition)
Context = ToolContext
