"""Outgoing WebSocket schema definitions."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.src.api.schemas.common import BaseMessage


class ErrorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    content: Optional[str] = None


class ErrorResponse(BaseMessage):
    type: Literal["error"]
    payload: ErrorPayload


class StreamingResponsePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str


class StreamingResponse(BaseMessage):
    type: Literal["streaming-response"]
    payload: StreamingResponsePayload


class StreamingComplete(BaseMessage):
    type: Literal["streaming-complete"]


class LlmThoughtPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str


class LlmThought(BaseMessage):
    type: Literal["llm-thought"]
    payload: LlmThoughtPayload


class ToolCallPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str


class ToolCallMessage(BaseMessage):
    type: Literal["tool-call"]
    payload: ToolCallPayload


class ToolBundleToolItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str
    args: Dict[str, Any]


class ToolBundlePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bundle_id: str
    tools: List[ToolBundleToolItem]


class ToolBundleMessage(BaseMessage):
    type: Literal["tool-bundle"]
    payload: ToolBundlePayload


class ToolOutputMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active_window: str
    execution_time: float
    success: bool


class ToolOutputPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    tool_name: str
    success: bool
    execution_time: Optional[float] = None
    output: str
    error: Optional[str] = None
    screenshot: Optional[str] = None
    metadata: Optional[ToolOutputMetadata] = None


class ToolOutputMessage(BaseMessage):
    type: Literal["tool-output"]
    payload: ToolOutputPayload


class AudioChunkPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audio: str
    sample_rate: int


class AudioChunkMessage(BaseMessage):
    type: Literal["audio-chunk"]
    payload: AudioChunkPayload


class WakewordActivatedMessage(BaseMessage):
    type: Literal["wakeword-activated"]
    payload: Dict[str, Any]


class WakewordGreetingPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str


class WakewordGreetingMessage(BaseMessage):
    type: Literal["wakeword-greeting"]
    payload: WakewordGreetingPayload


class SystemPromptPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    tool_schemas: Optional[Dict[str, Any]] = None


class SystemPromptMessage(BaseMessage):
    type: Literal["system-prompt"]
    payload: SystemPromptPayload


class UserMessageFullMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    original_query: str
    context_type: str
    injected_context: str
    active_window: str


class UserMessageFullPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    metadata: UserMessageFullMetadata


class UserMessageFullMessage(BaseMessage):
    type: Literal["user-message-full"]
    payload: UserMessageFullPayload


class AssistantMessageFullPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str


class AssistantMessageFullMessage(BaseMessage):
    type: Literal["assistant-message-full"]
    payload: AssistantMessageFullPayload
