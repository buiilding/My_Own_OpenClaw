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
    text: str

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

# Union type for parsing
IncomingMessage = Union[
    PingMessage,
    QueryMessage,
    LoadSettingsMessage,
    ListModelsMessage,
    UpdateSettingsMessage
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

class ToolOutputPayload(BaseModel):
    tool_name: str
    success: bool
    execution_time: Optional[float]
    output: str
    error: Optional[str]
    screenshot: Optional[str] = None

class ToolOutputMessage(BaseMessage):
    type: Literal["tool-output"]
    payload: ToolOutputPayload

