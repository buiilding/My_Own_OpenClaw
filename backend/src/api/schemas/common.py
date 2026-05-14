"""Common API schema primitives."""

from __future__ import annotations

import re
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.src.core.config.models import (
    AgentCapability,
    AgentToolProfile,
    CoordinateMethod,
)
from backend.src.core.validation.validators import ValidationError, validate_user_id
from backend.src.api.schemas.agent_definition import AgentDefinition

MAX_MSG_ID_LENGTH = 128
MSG_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


class BaseMessage(BaseModel):
    """Base WebSocket message envelope used after handshake."""

    model_config = ConfigDict(extra="forbid")

    id: str
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    user_id: str
    session_id: Optional[str] = None
    conversation_ref: Optional[str] = None
    turn_ref: Optional[str] = None
    timestamp: Optional[str] = None

    @field_validator("id")
    @classmethod
    def validate_msg_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Message ID cannot be empty or whitespace-only")
        v = v.strip()
        if len(v) > MAX_MSG_ID_LENGTH:
            raise ValueError(
                f"Message ID exceeds maximum length of {MAX_MSG_ID_LENGTH} characters"
            )
        if not MSG_ID_PATTERN.match(v):
            raise ValueError(
                "Message ID must contain only alphanumeric characters, underscores, and hyphens"
            )
        return v

    @field_validator("user_id")
    @classmethod
    def validate_user_id_field(cls, v: str) -> str:
        try:
            return validate_user_id(v)
        except ValidationError as e:
            raise ValueError(e.message) from e


class HandshakeMessage(BaseModel):
    """Handshake payload sent before base envelope messages."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["handshake"]
    user_id: str
    operating_system: Optional[str] = None
    available_tools: Optional[list[str]] = None
    available_coordinate_methods: Optional[list[CoordinateMethod]] = None
    client_tool_manifest: Optional[dict[str, Any]] = None
    requested_agent_policy: Optional["HandshakeAgentPolicy"] = None
    agent_definition: Optional[AgentDefinition] = None

    @field_validator("user_id")
    @classmethod
    def validate_handshake_user_id(cls, v: str) -> str:
        try:
            return validate_user_id(v)
        except ValidationError as e:
            raise ValueError(e.message) from e

    @field_validator("operating_system")
    @classmethod
    def validate_handshake_operating_system(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("operating_system cannot be empty or whitespace-only")
        if len(normalized) > 64:
            raise ValueError("operating_system exceeds 64 characters")
        return normalized

    @field_validator("available_tools")
    @classmethod
    def validate_available_tools(
        cls, value: Optional[list[str]]
    ) -> Optional[list[str]]:
        return _normalize_tool_name_list(value, field_name="available_tools")

    def to_session_config_overrides(self) -> dict[str, Any]:
        """Map handshake capability negotiation fields to AppConfig overrides."""
        overrides: dict[str, Any] = {}
        if self.available_tools is not None:
            overrides["agent_available_tools"] = list(self.available_tools)
        if self.available_coordinate_methods is not None:
            overrides["agent_available_coordinate_methods"] = list(
                self.available_coordinate_methods
            )
        if self.requested_agent_policy is not None:
            overrides.update(self.requested_agent_policy.to_session_config_overrides())
        return overrides


class HandshakeAgentPolicy(BaseModel):
    """Optional client-requested agent policy included in the handshake."""

    model_config = ConfigDict(extra="forbid")

    profile: Optional[AgentToolProfile] = None
    disabled_tools: Optional[list[str]] = None
    coordinate_methods: Optional[list[CoordinateMethod]] = None
    disabled_capabilities: Optional[list[AgentCapability]] = None

    @field_validator("disabled_tools")
    @classmethod
    def validate_disabled_tools(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        return _normalize_tool_name_list(value, field_name="disabled_tools")

    def to_session_config_overrides(self) -> dict[str, Any]:
        overrides: dict[str, Any] = {}
        if self.profile is not None:
            overrides["agent_tool_profile"] = self.profile
        if self.disabled_tools is not None:
            overrides["agent_disabled_tools"] = list(self.disabled_tools)
        if self.coordinate_methods is not None:
            overrides["agent_coordinate_methods"] = list(self.coordinate_methods)
        if self.disabled_capabilities is not None:
            overrides["agent_disabled_capabilities"] = list(self.disabled_capabilities)
        return overrides


def _normalize_tool_name_list(
    value: Optional[list[str]], *, field_name: str
) -> Optional[list[str]]:
    if value is None:
        return None
    normalized_tools: list[str] = []
    seen: set[str] = set()
    for raw_tool_name in value:
        if not isinstance(raw_tool_name, str):
            raise ValueError(f"{field_name} entries must be strings")
        tool_name = raw_tool_name.strip()
        if not tool_name:
            raise ValueError(f"{field_name} entries cannot be empty")
        if len(tool_name) > 128:
            raise ValueError(f"{field_name} entries cannot exceed 128 characters")
        if tool_name in seen:
            continue
        seen.add(tool_name)
        normalized_tools.append(tool_name)
    return normalized_tools
