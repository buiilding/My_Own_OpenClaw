"""
API Schema Definitions.

This module defines Pydantic models for all WebSocket message types used in the API,
including incoming messages (query, settings updates) and outgoing responses.
"""
from typing import Any, Dict, Literal, Optional, Union
from pydantic import BaseModel, Field

class BaseMessage(BaseModel):
    id: str
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    user_id: str = "default_user"

# Incoming Messages
class PingMessage(BaseMessage):
    type: Literal["ping"]

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
    user_id: str = "default_user"

# Union type for parsing
IncomingMessage = Union[
    PingMessage,
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
