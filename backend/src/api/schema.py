"""
API Schema Definitions.

This module defines Pydantic models for all WebSocket message types used in the API,
including incoming messages (query, settings updates) and outgoing responses.
"""
import re
from typing import Any, Dict, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator

from backend.src.core.validation import ValidationError, validate_user_id

# Constants for validation
MAX_MSG_ID_LENGTH = 128  # Maximum length for message IDs
MSG_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')  # Alphanumeric, underscore, hyphen only

class BaseMessage(BaseModel):
    id: str
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    user_id: str  # Required - must be set from connection context (no default to catch bugs)
    
    @field_validator('id')
    @classmethod
    def validate_msg_id(cls, v: str) -> str:
        """
        Validate message ID format and length.
        
        Security: Prevents injection of malformed IDs and limits length to prevent DoS.
        """
        if not v or not v.strip():
            raise ValueError("Message ID cannot be empty or whitespace-only")
        v = v.strip()
        if len(v) > MAX_MSG_ID_LENGTH:
            raise ValueError(f"Message ID exceeds maximum length of {MAX_MSG_ID_LENGTH} characters")
        if not MSG_ID_PATTERN.match(v):
            raise ValueError("Message ID must contain only alphanumeric characters, underscores, and hyphens")
        return v
    
    @field_validator('user_id')
    @classmethod
    def validate_user_id_field(cls, v: str) -> str:
        """
        Validate user_id to reject empty strings, whitespace-only, and 'default_user'.
        
        Security: Prevents security bypass and invalid state propagation.
        Uses shared validation utility for consistency.
        """
        try:
            return validate_user_id(v)
        except ValidationError as e:
            raise ValueError(e.message) from e

# Incoming Messages
class QueryPayload(BaseModel):
    text: str  # Original query text (for reference)
    content: Optional[str] = None  # Complete message content (system state + memories + query)

class QueryMessage(BaseMessage):
    type: Literal["query"]
    payload: QueryPayload

class LoadSettingsMessage(BaseMessage):
    type: Literal["load-settings"]

class ListModelsMessage(BaseMessage):
    type: Literal["list-models"]

class UpdateSettingsMessage(BaseMessage):
    type: Literal["update-settings"]
    payload: Dict[str, Any]

class WakewordDetectedMessage(BaseMessage):
    type: Literal["wakeword-detected"]

class ToolResultPayload(BaseModel):
    request_id: str
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class ToolResultMessage(BaseMessage):
    type: Literal["tool-result"]
    payload: ToolResultPayload

class HandshakeMessage(BaseModel):
    """Handshake message sent at WebSocket connection start."""
    type: Literal["handshake"]
    # FIX: Remove default value. Client MUST provide identity.
    user_id: str

# Union type for parsing
IncomingMessage = Union[
    QueryMessage,
    LoadSettingsMessage,
    ListModelsMessage,
    UpdateSettingsMessage,
    WakewordDetectedMessage,
    ToolResultMessage
]

# Outgoing Messages
class ErrorPayload(BaseModel):
    message: str
    content: Optional[str] = None

class ErrorResponse(BaseMessage):
    type: Literal["error"]
    payload: ErrorPayload

class StreamingResponse(BaseMessage):
    type: Literal["streaming-response"]
    payload: Dict[str, str]

class StreamingComplete(BaseMessage):
    type: Literal["streaming-complete"]

class LlmThought(BaseMessage):
    type: Literal["llm-thought"]
    payload: Dict[str, str]

class ToolCallPayload(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str

class ToolCallMessage(BaseMessage):
    type: Literal["tool-call"]
    payload: ToolCallPayload

class ToolOutputMetadata(BaseModel):
    active_window: str
    execution_time: float
    success: bool

class ToolOutputPayload(BaseModel):
    tool_name: str
    success: bool
    execution_time: Optional[float]
    output: str
    error: Optional[str]
    screenshot: Optional[str] = None
    metadata: Optional[ToolOutputMetadata] = None

class ToolOutputMessage(BaseMessage):
    type: Literal["tool-output"]
    payload: ToolOutputPayload

class AudioChunkPayload(BaseModel):
    audio: str # Base64 encoded PCM data
    sample_rate: int

class AudioChunkMessage(BaseMessage):
    type: Literal["audio-chunk"]
    payload: AudioChunkPayload

class WakewordActivatedMessage(BaseMessage):
    type: Literal["wakeword-activated"]
    payload: Dict[str, Any]

class WakewordGreetingPayload(BaseModel):
    text: str

class WakewordGreetingMessage(BaseMessage):
    type: Literal["wakeword-greeting"]
    payload: WakewordGreetingPayload

# Transparency Messages
class SystemPromptPayload(BaseModel):
    content: str
    tool_schemas: Optional[Dict[str, Any]] = None

class SystemPromptMessage(BaseMessage):
    type: Literal["system-prompt"]
    payload: SystemPromptPayload

class UserMessageFullMetadata(BaseModel):
    original_query: str
    context_type: str  # "initial" or "sequential"
    injected_context: str
    active_window: str

class UserMessageFullPayload(BaseModel):
    content: str
    metadata: UserMessageFullMetadata

class UserMessageFullMessage(BaseMessage):
    type: Literal["user-message-full"]
    payload: UserMessageFullPayload

class AssistantMessageFullPayload(BaseModel):
    content: str

class AssistantMessageFullMessage(BaseMessage):
    type: Literal["assistant-message-full"]
    payload: AssistantMessageFullPayload
