"""Common API schema primitives."""

from __future__ import annotations

import re
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.src.core.validation.validators import ValidationError, validate_user_id

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

    @field_validator("user_id")
    @classmethod
    def validate_handshake_user_id(cls, v: str) -> str:
        try:
            return validate_user_id(v)
        except ValidationError as e:
            raise ValueError(e.message) from e
