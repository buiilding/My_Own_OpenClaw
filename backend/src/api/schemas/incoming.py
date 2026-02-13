"""Incoming WebSocket schema definitions."""

from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from backend.src.api.schemas.common import BaseMessage


class QueryPayload(BaseModel):
    """Payload for `query` messages."""

    model_config = ConfigDict(
        extra="forbid",
        protected_namespaces=(),
    )

    text: str
    conversation_ref: str
    content: Optional[str] = None
    screenshot: Optional[str] = None
    screenshot_ref: Optional[str] = None
    system_state_internal: Optional[Dict[str, Any]] = None


class QueryMessage(BaseMessage):
    type: Literal["query"]
    payload: QueryPayload


class RehydrateConversationEntry(BaseModel):
    """One transcript row used to rebuild conversation history."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant", "tool"]
    content: str
    message_type: Optional[str] = None
    tool_name: Optional[str] = None
    correlation_id: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    timestamp: Optional[str] = None
    screenshot_ref: Optional[str] = None
    screenshot: Optional[str] = None


class RehydrateConversationPayload(BaseModel):
    """Payload for `rehydrate-conversation` messages."""

    model_config = ConfigDict(extra="forbid")

    conversation_ref: str
    messages: List[RehydrateConversationEntry]
    rehydrate_mode: Literal["replace"]


class RehydrateConversationMessage(BaseMessage):
    type: Literal["rehydrate-conversation"]
    payload: RehydrateConversationPayload


class LoadSettingsPayload(BaseModel):
    """Payload for `load-settings` messages."""

    model_config = ConfigDict(extra="forbid")

    client_version: Optional[str] = Field(default=None, min_length=1, max_length=128)


class LoadSettingsMessage(BaseMessage):
    type: Literal["load-settings"]
    payload: LoadSettingsPayload = Field(default_factory=LoadSettingsPayload)


class ListModelsPayload(BaseModel):
    """Payload for `list-models` messages."""

    model_config = ConfigDict(extra="forbid")


class ListModelsMessage(BaseMessage):
    type: Literal["list-models"]
    payload: ListModelsPayload = Field(default_factory=ListModelsPayload)


class UpdateSettingsPayload(BaseModel):
    """Frontend-owned config update payload."""

    model_config = ConfigDict(
        extra="forbid",
        protected_namespaces=(),
    )

    model_mode: Optional[str] = None
    model_provider: Optional[str] = None
    selected_model_id: Optional[str] = None
    interaction_mode: Optional[str] = None
    voice_mode_enabled: Optional[bool] = None
    speech_mode_enabled: Optional[bool] = None


class UpdateSettingsMessage(BaseMessage):
    type: Literal["update-settings"]
    payload: UpdateSettingsPayload


class WakewordDetectedPayload(BaseModel):
    """Payload for `wakeword-detected` messages."""

    model_config = ConfigDict(extra="forbid")


class WakewordDetectedMessage(BaseMessage):
    type: Literal["wakeword-detected"]
    payload: WakewordDetectedPayload = Field(default_factory=WakewordDetectedPayload)


class ToolResultSystemState(BaseModel):
    """Model-facing system state attached to each tool-result payload."""

    model_config = ConfigDict(extra="forbid")

    active_window: str
    mouse_position: str


class ToolResultData(BaseModel):
    """Tool-result data emitted by frontend and consumed by backend."""

    # Keep open for tool-specific data fields while freezing shared contract keys.
    model_config = ConfigDict(extra="allow")

    llm_content: str
    system_state: Optional[ToolResultSystemState] = None
    screenshot: Optional[str] = None
    screenshot_ref: Optional[str] = None


class ToolResultPayload(BaseModel):
    """Payload for `tool-result` messages."""

    model_config = ConfigDict(extra="forbid")

    request_id: str
    success: bool
    data: Optional[ToolResultData] = None
    error: Optional[str] = None


class ToolResultMessage(BaseMessage):
    type: Literal["tool-result"]
    payload: ToolResultPayload


class ToolBundleStepResult(BaseModel):
    """One step in a tool bundle result."""

    # Step payloads may include tool-specific debug fields.
    model_config = ConfigDict(extra="allow")

    tool: str
    status: str
    output: Optional[Any] = None


class ToolBundleResultPayload(BaseModel):
    """Payload for `tool-bundle-result` messages."""

    model_config = ConfigDict(extra="forbid")

    bundle_id: str
    status: Literal["success", "partial_failure", "failure"]
    # Screenshot fields are conditional: include only for computer-use bundles.
    screenshot: Optional[str] = None
    screenshot_ref: Optional[str] = None
    system_state: Optional[Dict[str, Any]] = None
    step_results: List[ToolBundleStepResult]
    error: Optional[str] = None


class ToolBundleResultMessage(BaseMessage):
    type: Literal["tool-bundle-result"]
    payload: ToolBundleResultPayload


IncomingMessage = Annotated[
    Union[
        QueryMessage,
        RehydrateConversationMessage,
        LoadSettingsMessage,
        ListModelsMessage,
        UpdateSettingsMessage,
        WakewordDetectedMessage,
        ToolResultMessage,
        ToolBundleResultMessage,
    ],
    Field(discriminator="type"),
]
