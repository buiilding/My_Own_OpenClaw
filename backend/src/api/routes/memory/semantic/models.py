"""Pydantic request/response models for semantic memory routes."""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field, field_validator

from backend.src.core.validation.validators import ValidationError, validate_user_id


class SummarizeRequest(BaseModel):
    """Request model for semantic summarization."""

    conversations: List[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of conversation texts to summarize (max 100 items)",
    )
    user_id: str = Field(
        ...,
        min_length=1,
        description="User ID (required, cannot be default_user)",
    )

    @field_validator("conversations")
    @classmethod
    def validate_conversation_lengths(cls, value: List[str]) -> List[str]:
        max_length = 32768
        for index, conversation in enumerate(value):
            if len(conversation) > max_length:
                raise ValueError(
                    f"Conversation {index} exceeds maximum length of {max_length} characters"
                )
        return value

    @field_validator("user_id")
    @classmethod
    def validate_user_id_field(cls, value: str) -> str:
        try:
            return validate_user_id(value)
        except ValidationError as error:
            raise ValueError(error.message) from error


class SummarizeResponse(BaseModel):
    """Response model for semantic summarization."""

    summary: str
    facts: List[str]
    success: bool


class GenerateTitleRequest(BaseModel):
    """Request model for conversation title generation."""

    user_id: str = Field(
        ...,
        min_length=1,
        description="User ID (required, cannot be default_user)",
    )
    user_message: str = Field(
        ...,
        min_length=1,
        max_length=32768,
        description="First user message text",
    )
    assistant_message: str = Field(
        ...,
        min_length=1,
        max_length=32768,
        description="First assistant message text",
    )
    model_id: str | None = Field(
        default=None,
        max_length=256,
        description="Optional model override for title generation",
    )
    model_provider: str | None = Field(
        default=None,
        max_length=128,
        description="Optional provider override for title generation",
    )

    @field_validator("user_id")
    @classmethod
    def validate_title_user_id_field(cls, value: str) -> str:
        try:
            return validate_user_id(value)
        except ValidationError as error:
            raise ValueError(error.message) from error


class GenerateTitleResponse(BaseModel):
    """Response model for title generation."""

    title: str
    success: bool
