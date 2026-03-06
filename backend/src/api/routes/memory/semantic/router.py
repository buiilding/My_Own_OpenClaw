"""Semantic memory API routes."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter

from backend.src.api.deps import ContainerDep, SessionManagerDep
from backend.src.api.routes.memory.health import (
    dependency_health_check,
    healthy_payload,
)
from .models import (
    GenerateTitleRequest,
    GenerateTitleResponse,
    SummarizeRequest,
    SummarizeResponse,
)
from .parser import extract_fallback_facts, parse_summarization_response
from .service import SemanticSummarizationService
from backend.src.core.config.manager import load_api_key_for_provider
from backend.src.llm.client import get_llm_client

router = APIRouter(prefix="/api/semantic", tags=["semantic"])
logger = logging.getLogger(__name__)

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
