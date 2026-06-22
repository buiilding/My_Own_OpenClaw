"""Outgoing WebSocket schema definitions."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict

from backend.src.api.schemas.common import BaseMessage, DisplayAttachment


class ErrorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    content: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ErrorResponse(BaseMessage):
    type: Literal["error"]
    payload: ErrorPayload


class QueryAcceptedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["accepted"]


class QueryAcceptedMessage(BaseMessage):
    type: Literal["query-accepted"]
    payload: QueryAcceptedPayload


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
    output: Optional[Any] = None
    error: Optional[str] = None
    screenshot: Optional[str] = None
    screenshot_ref: Optional[str] = None
    screenshot_url: Optional[str] = None
    screenshot_content_type: Optional[str] = None
    display_attachments: Optional[List[DisplayAttachment]] = None
    metadata: Optional[ToolOutputMetadata] = None


class ToolOutputMessage(BaseMessage):
    type: Literal["tool-output"]
    payload: ToolOutputPayload


class WebSearchProgressPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    request_id: Optional[str] = None
    action_type: Optional[str] = None
    query: Optional[str] = None
    url: Optional[str] = None
    pattern: Optional[str] = None


class WebSearchProgressMessage(BaseMessage):
    type: Literal["web-search-progress"]
    payload: WebSearchProgressPayload


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


class SettingsLoadedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: Dict[str, Any]


class SettingsLoadedMessage(BaseMessage):
    type: Literal["settings-loaded"]
    payload: SettingsLoadedPayload


class StopQueryAckPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["stopped", "not-running"]
    canceled: bool
    conversation_ref: Optional[str] = None
    turn_ref: Optional[str] = None


class StopQueryAckMessage(BaseMessage):
    type: Literal["stop-query-ack"]
    payload: StopQueryAckPayload


class SettingsUpdatedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    updated_keys: List[str]


class SettingsUpdatedMessage(BaseMessage):
    type: Literal["settings-updated"]
    payload: SettingsUpdatedPayload


class ModelsListedMessage(BaseMessage):
    type: Literal["models-listed"]
    payload: List[Dict[str, Any]]


class ToolSchemaPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    name: Optional[str] = None
    description: Optional[str] = None
    strict: Optional[bool] = None
    parameters: Optional[Dict[str, Any]] = None


class SystemPromptPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    tool_schemas: Optional[List[ToolSchemaPayload]] = None
    client_prompt_layers: Optional[List[Dict[str, Any]]] = None


class SystemPromptMessage(BaseMessage):
    type: Literal["system-prompt"]
    payload: SystemPromptPayload


class ToolSchemasPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool_schemas: List[ToolSchemaPayload]


class ToolSchemasMessage(BaseMessage):
    type: Literal["tool-schemas"]
    payload: ToolSchemasPayload


class TokenCountPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_tokens: int
    visible_output_tokens: int
    thinking_tokens: Optional[int]
    output_tokens_total: int
    total_tokens: int
    conversation_tokens: int
    usage_source: Literal["provider", "estimated"]
    cached_tokens: Optional[int] = None
    cache_hit: Optional[bool] = None
    cache_status: Optional[Literal["hit", "miss", "unknown"]] = None


class TokenCountMessage(BaseMessage):
    type: Literal["token-count"]
    payload: TokenCountPayload


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


class ContextCompactionStartedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str
    strategy: str
    before_tokens: int
    projected_tokens: int


class ContextCompactionStartedMessage(BaseMessage):
    type: Literal["context-compaction-started"]
    payload: ContextCompactionStartedPayload


class ContextCompactionCompletedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str
    strategy: str
    before_tokens: int
    after_tokens: int
    removed_messages: int
    summary_preview: Optional[str] = None
    summary_text: Optional[str] = None
    replacement_history_preview: Optional[List[Dict[str, Any]]] = None
    replacement_history_entries: Optional[List[Dict[str, Any]]] = None
    skipped_reason: Optional[str] = None


class ContextCompactionCompletedMessage(BaseMessage):
    type: Literal["context-compaction-completed"]
    payload: ContextCompactionCompletedPayload


class ContextCompactionFailedPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str
    strategy: str
    error: str
    before_tokens: Optional[int] = None


class ContextCompactionFailedMessage(BaseMessage):
    type: Literal["context-compaction-failed"]
    payload: ContextCompactionFailedPayload


class TraceErrorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class TraceEventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1]
    path: str
    stage: str
    status: Literal["started", "succeeded", "failed", "skipped"]
    runtime: Literal[
        "sdk",
        "electron-main",
        "renderer",
        "local-runtime",
        "backend",
        "provider",
    ]
    traceId: Optional[str] = None
    spanId: Optional[str] = None
    parentSpanId: Optional[str] = None
    requestId: Optional[str] = None
    startedAt: Optional[str] = None
    endedAt: Optional[str] = None
    durationMs: Optional[int] = None
    data: Optional[Dict[str, Any]] = None
    error: Optional[TraceErrorPayload] = None


class TraceEventMessage(BaseMessage):
    type: Literal["trace-event"]
    payload: TraceEventPayload
