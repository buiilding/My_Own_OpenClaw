"""Semantic memory API routes."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from backend.src.api.deps import ContainerDep, SessionManagerDep
from backend.src.api.routes.memory.health import (
    dependency_health_check,
    healthy_payload,
)
from backend.src.api.routes.memory.semantic_parser import (
    extract_fallback_facts,
    parse_summarization_response,
)
from backend.src.api.routes.memory.semantic_service import SemanticSummarizationService
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.core.validation.validators import ValidationError, validate_user_id
from backend.src.llm.client import get_llm_client

router = APIRouter(prefix="/api/semantic", tags=["semantic"])
logger = logging.getLogger(__name__)


class SummarizeRequest(BaseModel):
    """Request model for semantic summarization."""

    conversations: List[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="List of conversation texts to summarize (max 100 items)",
    )
    user_id: str = Field(
        ..., min_length=1, description="User ID (required, cannot be default_user)"
    )

    @field_validator("conversations")
    @classmethod
    def validate_conversation_lengths(cls, v: List[str]) -> List[str]:
        max_length = 32768
        for i, conv in enumerate(v):
            if len(conv) > max_length:
                raise ValueError(
                    f"Conversation {i} exceeds maximum length of {max_length} characters"
                )
        return v

    @field_validator("user_id")
    @classmethod
    def validate_user_id_field(cls, v: str) -> str:
        try:
            return validate_user_id(v)
        except ValidationError as e:
            raise ValueError(e.message) from e


class SummarizeResponse(BaseModel):
    """Response model for semantic summarization."""

    summary: str
    facts: List[str]
    success: bool


class GenerateTitleRequest(BaseModel):
    """Request model for conversation title generation."""

    user_id: str = Field(
        ..., min_length=1, description="User ID (required, cannot be default_user)"
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
    def validate_title_user_id_field(cls, v: str) -> str:
        try:
            return validate_user_id(v)
        except ValidationError as e:
            raise ValueError(e.message) from e


class GenerateTitleResponse(BaseModel):
    """Response model for title generation."""

    title: str
    success: bool


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_conversations(
    request: SummarizeRequest,
    container: ContainerDep,
    session_manager: SessionManagerDep,
) -> SummarizeResponse:
    """Summarize conversations and extract semantic information."""
    service = SemanticSummarizationService(
        get_llm_client_fn=get_llm_client,
        load_api_key_fn=load_api_key_for_provider,
        parse_response_fn=parse_summarization_response,
        fallback_facts_fn=extract_fallback_facts,
    )
    summary, facts = await service.summarize(
        conversations=request.conversations,
        user_id=request.user_id,
        container=container,
        session_manager=session_manager,
    )

    logger.info(
        "Summarized %s conversations into %s facts for user %s",
        len(request.conversations),
        len(facts),
        request.user_id,
    )

    return SummarizeResponse(summary=summary, facts=facts, success=True)


@router.post("/title", response_model=GenerateTitleResponse)
async def generate_conversation_title(
    request: GenerateTitleRequest,
    container: ContainerDep,
    session_manager: SessionManagerDep,
) -> GenerateTitleResponse:
    """Generate a conversation title using the active user model."""
    service = SemanticSummarizationService(
        get_llm_client_fn=get_llm_client,
        load_api_key_fn=load_api_key_for_provider,
        parse_response_fn=parse_summarization_response,
        fallback_facts_fn=extract_fallback_facts,
    )
    title = await service.generate_title(
        user_message=request.user_message,
        assistant_message=request.assistant_message,
        user_id=request.user_id,
        container=container,
        session_manager=session_manager,
        model_id_override=request.model_id,
        model_provider_override=request.model_provider,
    )
    return GenerateTitleResponse(title=title, success=True)


@router.get("/health")
async def health_check(container: ContainerDep) -> Dict[str, Any]:
    """Health check for semantic summarization service."""
    return await dependency_health_check(
        dependency=None,
        get_dependency=lambda: container.llm_client,
        missing_message="LLM client not available",
        on_healthy=lambda _client: healthy_payload(
            message="Semantic summarization service ready"
        ),
        logger=logger,
        error_log_prefix="Semantic health check failed",
    )


# Backward-compatible exports for existing tests/callers.
def _parse_summarization_response(response_text: str) -> Tuple[str, List[str]]:
    return parse_summarization_response(response_text)


def _extract_fallback_facts(response_text: str) -> List[str]:
    return extract_fallback_facts(response_text)
