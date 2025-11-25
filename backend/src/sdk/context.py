"""
SDK Context Classes.

This module defines the execution context passed to all tools, including user context,
session context, and service access. The context is immutable during tool execution.
"""
from typing import Any, Dict, Optional, Protocol
from dataclasses import dataclass, field

@dataclass
class UserContext:
    """Context specific to the user invoking the action."""
    user_id: str
    username: Optional[str] = None
    permissions: list[str] = field(default_factory=list)

@dataclass
class SessionContext:
    """Context specific to the current conversation session."""
    session_id: str
    created_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Context:
    """
    The execution context passed to all tools and plugins.
    
    This object is immutable for the duration of a tool's execution.
    It provides access to user info, session info, and safe services.
    """
    user: UserContext
    session: SessionContext
    workspace_root: str
    
    # Services (Abstractions, not implementations)
    # In a real DI system, these would be interfaces
    services: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_interactive(self) -> bool:
        """Whether the tool is running in an interactive session."""
        return True

