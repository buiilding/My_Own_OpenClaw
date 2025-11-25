"""
Event System for the Desktop Assistant.

This module defines all event types used throughout the application for decoupled
communication between components. Events are dataclasses that carry relevant data.
"""
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

@dataclass
class ConfigChanged(Event):
    """Event fired when configuration is updated."""
    old_config: Any = None
    new_config: Any = None

@dataclass
class ToolExecutionStarted(Event):
    """Event fired when a tool execution begins."""
    session_id: str = None
    user_id: str = None
    tool_name: str = None
    input_params: Dict[str, Any] = None

@dataclass
class LLMRequestStarted(Event):
    """Event fired when an LLM request begins."""
    session_id: str = None
    user_id: str = None
    model: str = None
    prompt_length: int = 0

@dataclass
class LLMRequestCompleted(Event):
    """Event fired when an LLM request completes."""
    session_id: str = None
    user_id: str = None
    model: str = None
    response_length: int = 0
    tokens_used: Optional[int] = None
    duration_ms: Optional[float] = None

@dataclass
class MemoryStored(Event):
    """Event fired when a memory is stored."""
    session_id: str = None
    user_id: str = None
    memory_id: str = None
    memory_type: str = None  # "episodic" or "semantic"

@dataclass
class SessionCreated(Event):
    """Event fired when a new session is created."""
    session_id: str = None
    user_id: str = None

@dataclass
class SessionDestroyed(Event):
    """Event fired when a session is destroyed."""
    session_id: str = None
    user_id: str = None

@dataclass
class ErrorOccurred(Event):
    """Event fired when an error occurs."""
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    error_type: str = None
    error_message: str = None
    error_details: Optional[Dict[str, Any]] = None
