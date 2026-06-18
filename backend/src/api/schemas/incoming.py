"""Incoming WebSocket schema definitions."""

from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_conversation_ref(value: str) -> str:
    """Normalize and validate conversation refs carried in payloads."""
    normalized = value.strip()
    if not normalized:
        raise ValueError("conversation_ref cannot be empty or whitespace-only")
    return normalized


def _validate_turn_ref(value: str) -> str:
    """Normalize and validate turn refs carried in payloads."""
    normalized = value.strip()
    if not normalized:
        raise ValueError("turn_ref cannot be empty or whitespace-only")
    return normalized


def _validate_correlation_ref(value: str, *, field_name: str) -> str:
    """Normalize and validate correlation ids carried in tool-result payloads."""
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} cannot be empty or whitespace-only")
    return normalized


def _validate_optional_workspace_path(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


from backend.src.api.schemas.agent_definition import AgentDefinition
from backend.src.api.schemas.common import BaseMessage


class QueryPayload(BaseModel):
    """Payload for `query` messages."""

    model_config = ConfigDict(
        extra="forbid",
        protected_namespaces=(),
    )

    text: str
    conversation_ref: str
    content: str = Field(min_length=1)
    screenshot_ref: Optional[str] = None
    screenshot_refs: Optional[List[str]] = None
    capture_meta: Optional[Dict[str, Any]] = None
    system_state_internal: Optional[Dict[str, Any]] = None
    workspace_path: Optional[str] = None
    repo_instruction_messages: Optional[List["RepoInstructionMessage"]] = None
    client_prompt_layers: Optional[List["ClientPromptLayer"]] = None
    agent_definition: Optional[AgentDefinition] = None

    @field_validator("conversation_ref")
    @classmethod
    def validate_conversation_ref(cls, value: str) -> str:
        return _validate_conversation_ref(value)

    @field_validator("workspace_path")
    @classmethod
    def validate_workspace_path(cls, value: Optional[str]) -> Optional[str]:
        return _validate_optional_workspace_path(value)


class QueryMessage(BaseMessage):
    type: Literal["query"]
    payload: QueryPayload


class RepoInstructionMessage(BaseModel):
    """One contextual repo-instruction message supplied by the local app runtime."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user"]
    content: str = Field(min_length=1, max_length=200_000)


class ClientPromptLayer(BaseModel):
    """One client-provided prompt layer compiled after backend base rules."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_.:-]+$")
    type: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_.:-]+$")
    priority: int = Field(default=100, ge=0, le=1_000)
    content: str = Field(min_length=1, max_length=200_000)


class StopQueryPayload(BaseModel):
    """Payload for `stop-query` messages."""

    model_config = ConfigDict(extra="forbid")
    conversation_ref: Optional[str] = None
    turn_ref: Optional[str] = None

    @field_validator("conversation_ref")
    @classmethod
    def validate_conversation_ref(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _validate_conversation_ref(value)

    @field_validator("turn_ref")
    @classmethod
    def validate_turn_ref(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _validate_turn_ref(value)


class StopQueryMessage(BaseMessage):
    type: Literal["stop-query"]
    payload: StopQueryPayload = Field(default_factory=StopQueryPayload)


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
    transparency: Optional[Dict[str, Any]] = None
    structured_payload: Optional[Dict[str, Any]] = None
    structured_content: Optional[List[Dict[str, Any]]] = None
    compaction_facts: Optional[Dict[str, Any]] = None


class RehydrateConversationPayload(BaseModel):
    """Payload for `rehydrate-conversation` messages."""

    model_config = ConfigDict(extra="forbid")

    conversation_ref: str
    messages: List[RehydrateConversationEntry]
    rehydrate_mode: Literal["replace"]
    workspace_path: Optional[str] = None
    repo_instruction_messages: Optional[List[RepoInstructionMessage]] = None

    @field_validator("conversation_ref")
    @classmethod
    def validate_conversation_ref(cls, value: str) -> str:
        return _validate_conversation_ref(value)

    @field_validator("workspace_path")
    @classmethod
    def validate_workspace_path(cls, value: Optional[str]) -> Optional[str]:
        return _validate_optional_workspace_path(value)


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


class ProviderApiKeyEntry(BaseModel):
    """One provider API key override entry in the client settings payload."""

    model_config = ConfigDict(extra="forbid")

    enabled: Optional[bool] = None
    api_key: Optional[str] = None


class ProviderApiKeysPayload(BaseModel):
    """Client-provided per-provider API key overrides."""

    model_config = ConfigDict(extra="forbid")

    openai: Optional[ProviderApiKeyEntry] = None
    anthropic: Optional[ProviderApiKeyEntry] = None
    google: Optional[ProviderApiKeyEntry] = None
    openrouter: Optional[ProviderApiKeyEntry] = None
    mistral: Optional[ProviderApiKeyEntry] = None
    kimi_coding: Optional[ProviderApiKeyEntry] = None


class ToolManifestSettingsPayload(BaseModel):
    """Client-provided tool manifest replacement."""

    model_config = ConfigDict(extra="forbid")

    mode: str = Field(min_length=1, max_length=64)
    client_manifest: Dict[str, Any]


class UpdateSettingsPayload(BaseModel):
    """Client settings update payload."""

    model_config = ConfigDict(
        extra="forbid",
        protected_namespaces=(),
    )

    model_mode: Optional[str] = None
    model_provider: Optional[str] = None
    selected_model_id: Optional[str] = None
    interaction_mode: Optional[str] = None
    speech_mode_enabled: Optional[bool] = None
    wakeword_enabled: Optional[bool] = None
    wakeword_stt_enabled: Optional[bool] = None
    browser_automation_enabled: Optional[bool] = None
    include_query_screenshot: Optional[bool] = None
    provider_api_keys: Optional[ProviderApiKeysPayload] = None
    tools: Optional[ToolManifestSettingsPayload] = None
    agent_definition: Optional[AgentDefinition] = None


class UpdateSettingsMessage(BaseMessage):
    type: Literal["update-settings"]
    payload: UpdateSettingsPayload


class WakewordDetectedPayload(BaseModel):
    """Payload for `wakeword-detected` messages."""

    model_config = ConfigDict(extra="forbid")


class WakewordDetectedMessage(BaseMessage):
    type: Literal["wakeword-detected"]
    payload: WakewordDetectedPayload = Field(default_factory=WakewordDetectedPayload)


class CompactHistoryPayload(BaseModel):
    """Payload for `compact-history` messages."""

    model_config = ConfigDict(extra="forbid")

    force: bool = True
    conversation_ref: Optional[str] = None

    @field_validator("conversation_ref")
    @classmethod
    def validate_conversation_ref(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return _validate_conversation_ref(value)


class CompactHistoryMessage(BaseMessage):
    type: Literal["compact-history"]
    payload: CompactHistoryPayload = Field(default_factory=CompactHistoryPayload)


class ToolResultSystemState(BaseModel):
    """Model-facing system state attached to each tool-result payload."""

    model_config = ConfigDict(extra="forbid")

    active_window: str
    mouse_position: str


class ToolCaptureBounds(BaseModel):
    """Desktop-space rectangle bounds used by capture metadata."""

    model_config = ConfigDict(extra="forbid")

    x: int
    y: int
    width: int
    height: int


class ToolCaptureMeta(BaseModel):
    """Frame-local capture metadata used for screenshot_px -> desktop_px mapping."""

    model_config = ConfigDict(extra="forbid")

    source_w: int
    source_h: int
    crop_x: int
    crop_y: int
    crop_w: int
    crop_h: int
    desktop_virtual_bounds: Optional[ToolCaptureBounds] = None
    monitor_id: Optional[str] = None
    timestamp: int
    capture_engine: Optional[str] = None


class ToolResultData(BaseModel):
    """Tool-result data emitted by the SDK/local runtime and consumed by backend."""

    # Keep open for tool-specific data fields while freezing shared contract keys.
    model_config = ConfigDict(extra="allow")

    output: Any
    system_state: Optional[ToolResultSystemState] = None
    screenshot: Optional[str] = None
    screenshot_ref: Optional[str] = None
    capture_meta: Optional[ToolCaptureMeta] = None


class ToolResultPayload(BaseModel):
    """Payload for `tool-result` messages."""

    model_config = ConfigDict(extra="forbid")

    request_id: str
    success: bool
    data: ToolResultData
    error: Optional[str] = None

    @field_validator("request_id")
    @classmethod
    def validate_request_id(cls, value: str) -> str:
        return _validate_correlation_ref(value, field_name="request_id")


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
    capture_meta: Optional[ToolCaptureMeta] = None
    system_state: Optional[Dict[str, Any]] = None
    step_results: List[ToolBundleStepResult]
    error: Optional[str] = None

    @field_validator("bundle_id")
    @classmethod
    def validate_bundle_id(cls, value: str) -> str:
        return _validate_correlation_ref(value, field_name="bundle_id")


class ToolBundleResultMessage(BaseMessage):
    type: Literal["tool-bundle-result"]
    payload: ToolBundleResultPayload


IncomingMessage = Annotated[
    Union[
        QueryMessage,
        StopQueryMessage,
        RehydrateConversationMessage,
        LoadSettingsMessage,
        ListModelsMessage,
        UpdateSettingsMessage,
        WakewordDetectedMessage,
        CompactHistoryMessage,
        ToolResultMessage,
        ToolBundleResultMessage,
    ],
    Field(discriminator="type"),
]
