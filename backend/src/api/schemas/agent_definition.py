"""First-class client-defined agent contract.

The same object can be sent during websocket handshake today and stored by a
future REST agent API without changing the shape.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.src.core.config.models import AgentCapability, CoordinateMethod


def _normalize_optional_string(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_string_list(value: Optional[list[str]]) -> Optional[list[str]]:
    if value is None:
        return None
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_item in value:
        if not isinstance(raw_item, str):
            raise ValueError("entries must be strings")
        item = raw_item.strip()
        if not item:
            raise ValueError("entries cannot be empty")
        if item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


class AgentSystemPromptDefinition(BaseModel):
    """Client control over the base agent prompt."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["default", "replace"] = "default"
    content: Optional[str] = Field(None, max_length=400_000)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_string(value)

    def replacement_content(self) -> Optional[str]:
        if self.mode != "replace":
            return None
        return self.content


class AgentPromptContribution(BaseModel):
    """One instruction contribution supplied by a client-defined agent."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_.:-]+$")
    type: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_.:-]+$")
    priority: int = Field(default=100, ge=0, le=1_000)
    content: str = Field(min_length=1, max_length=200_000)
    revision: Optional[str] = Field(None, max_length=128)
    source_path: Optional[str] = Field(None, max_length=4096)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("content cannot be empty")
        return normalized

    @field_validator("revision", "source_path")
    @classmethod
    def validate_optional_strings(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_string(value)

    def to_client_prompt_layer(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "priority": self.priority,
            "content": self.content,
            **({"revision": self.revision} if self.revision is not None else {}),
            **(
                {"source_path": self.source_path}
                if self.source_path is not None
                else {}
            ),
        }


class AgentPluginContribution(BaseModel):
    """Metadata and prompt contributions from a client-side plugin package."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_.:-]+$")
    name: Optional[str] = Field(None, max_length=128)
    version: Optional[str] = Field(None, max_length=64)
    prompt_layers: list[AgentPromptContribution] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name", "version")
    @classmethod
    def validate_optional_strings(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_string(value)


class AgentToolsDefinition(BaseModel):
    """Tools and tool policy supplied by an agent-definition client."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["default", "default_plus_client", "client_only", "explicit"] = (
        "default_plus_client"
    )
    client_manifest: Optional[dict[str, Any]] = None
    available_tools: Optional[list[str]] = None
    enabled_remote_tools: list[str] = Field(default_factory=list)
    disabled_tools: list[str] = Field(default_factory=list)
    disabled_capabilities: list[AgentCapability] = Field(default_factory=list)

    @field_validator("available_tools", "enabled_remote_tools", "disabled_tools")
    @classmethod
    def validate_tool_lists(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        return _normalize_string_list(value)


class AgentRuntimeDefinition(BaseModel):
    """Runtime facts that affect prompt rendering and tool policy."""

    model_config = ConfigDict(extra="forbid")

    operating_system: Optional[str] = Field(None, max_length=64)
    workspace_path: Optional[str] = Field(None, max_length=4096)
    coordinate_methods: Optional[list[CoordinateMethod]] = None

    @field_validator("operating_system", "workspace_path")
    @classmethod
    def validate_optional_strings(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_string(value)


class AgentDefinition(BaseModel):
    """Full client-defined agent contract.

    Missing fields intentionally fall back to the hosted backend's default
    agent policy. This lets custom clients send almost nothing and still get
    the packaged default behavior, while advanced clients can progressively
    define the agent.
    """

    model_config = ConfigDict(extra="forbid")

    version: int = Field(default=1, ge=1, le=1)
    id: Optional[str] = Field(None, min_length=1, max_length=128)
    name: Optional[str] = Field(None, max_length=128)
    mode: Literal["default", "default_plus_overrides", "custom"] = (
        "default_plus_overrides"
    )
    system_prompt: AgentSystemPromptDefinition = Field(
        default_factory=AgentSystemPromptDefinition
    )
    tools: AgentToolsDefinition = Field(default_factory=AgentToolsDefinition)
    prompt_layers: list[AgentPromptContribution] = Field(default_factory=list)
    skills: list[AgentPromptContribution] = Field(default_factory=list)
    agents_md: list[AgentPromptContribution] = Field(default_factory=list)
    plugins: list[AgentPluginContribution] = Field(default_factory=list)
    runtime: AgentRuntimeDefinition = Field(default_factory=AgentRuntimeDefinition)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("id", "name")
    @classmethod
    def validate_optional_strings(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_optional_string(value)

    def system_prompt_override(self) -> Optional[str]:
        return self.system_prompt.replacement_content()

    def client_tool_manifest(self) -> Optional[dict[str, Any]]:
        return self.tools.client_manifest

    def client_prompt_layers(self) -> list[dict[str, Any]]:
        layers: list[dict[str, Any]] = []
        for collection in (self.agents_md, self.skills, self.prompt_layers):
            layers.extend(layer.to_client_prompt_layer() for layer in collection)
        for plugin in self.plugins:
            layers.extend(
                layer.to_client_prompt_layer() for layer in plugin.prompt_layers
            )
        layers.sort(key=lambda layer: int(layer.get("priority", 100)))
        return layers

    def to_session_config_overrides(
        self,
        *,
        accepted_client_tool_names: list[str] | None = None,
    ) -> dict[str, Any]:
        overrides: dict[str, Any] = {}
        tool_names = list(accepted_client_tool_names or [])
        enabled_remote_tools = list(self.tools.enabled_remote_tools or [])

        if self.tools.mode == "client_only":
            overrides["agent_available_tools"] = _dedupe_strings(
                [*tool_names, *enabled_remote_tools]
            )
        elif self.tools.mode == "explicit":
            overrides["agent_available_tools"] = _dedupe_strings(
                [
                    *(self.tools.available_tools or []),
                    *tool_names,
                    *enabled_remote_tools,
                ]
            )
        elif self.tools.available_tools is not None:
            overrides["agent_available_tools"] = _dedupe_strings(
                [*self.tools.available_tools, *tool_names, *enabled_remote_tools]
            )

        if self.tools.disabled_tools:
            overrides["agent_disabled_tools"] = list(self.tools.disabled_tools)
        if self.tools.disabled_capabilities:
            overrides["agent_disabled_capabilities"] = list(
                self.tools.disabled_capabilities
            )
        if self.runtime.coordinate_methods is not None:
            overrides["agent_available_coordinate_methods"] = list(
                self.runtime.coordinate_methods
            )
        return overrides


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = value.strip() if isinstance(value, str) else ""
        if not item or item in seen:
            continue
        seen.add(item)
        deduped.append(item)
    return deduped
