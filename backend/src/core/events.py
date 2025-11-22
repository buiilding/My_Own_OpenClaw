from dataclasses import dataclass, field
from typing import Any, Dict, Optional

@dataclass
class Event:
    """Base class for all events."""
    timestamp: float = field(default=0.0)  # Should be set on creation

@dataclass
class UserMessageReceived(Event):
    """Event fired when a user sends a message."""
    session_id: str = None
    user_id: str = None
    message: str = None

@dataclass
class AgentResponseGenerated(Event):
    """Event fired when the agent generates a response."""
    session_id: str = None
    user_id: str = None
    response: str = None

@dataclass
class ToolExecuted(Event):
    """Event fired when a tool finishes execution."""
    session_id: str = None
    user_id: str = None
    tool_name: str = None
    input_params: Dict[str, Any] = None
    result: Any = None
    success: bool = False

@dataclass
class InteractionCompleted(Event):
    """Event fired when a full conversation turn is completed."""
    session_id: str = None
    user_id: str = None
    user_message: str = None
    assistant_response: str = None
