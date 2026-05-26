"""Semantic memory API routes."""

from __future__ import annotations

import logging
import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from backend.src.api.auth.context import get_current_authenticated_install_identity
from backend.src.api.deps import ContainerDep, SessionManagerDep
from backend.src.api.routes.memory.health import (
    healthy_payload,
    safe_health_check,
    unhealthy_payload,
)
from .models import (
    GenerateTitleRequest,
    GenerateTitleResponse,
    SummarizeRequest,
    SummarizeResponse,
)
from .parser import extract_fallback_facts, parse_summarization_response
from .service import SemanticSummarizationService
from backend.src.core.config.loader import load_api_key_for_provider
from backend.src.llm.client import get_llm_client

router = APIRouter(prefix="/api/semantic", tags=["semantic"])
logger = logging.getLogger(__name__)


def _log_semantic_route_start(
    *,
    route_label: str,
    user_id: str,
    conversation_count: int | None = None,
    user_chars: int | None = None,
    assistant_chars: int | None = None,
) -> float:
    started_at = time.perf_counter()
    logger.info(
        "[MemoryRoute] %s start user_id=%s conversations=%s user_chars=%s assistant_chars=%s",
        route_label,
        user_id,
        conversation_count if conversation_count is not None else "-",
        user_chars if user_chars is not None else "-",
        assistant_chars if assistant_chars is not None else "-",
    )
    return started_at


def _log_semantic_route_success(
    *,
    route_label: str,
    user_id: str,
    started_at: float,
    fact_count: int | None = None,
    title_chars: int | None = None,
) -> None:
    logger.info(
        "[MemoryRoute] %s success user_id=%s facts=%s title_chars=%s duration=%.3fs",
        route_label,
        user_id,
        fact_count if fact_count is not None else "-",
        title_chars if title_chars is not None else "-",
        time.perf_counter() - started_at,
    )


def _log_semantic_route_failure(
    *,
    route_label: str,
    user_id: str,
    started_at: float,
    error: Exception,
) -> None:
    logger.error(
        "[MemoryRoute] %s failure user_id=%s duration=%.3fs error=%s",
        route_label,
        user_id,
        time.perf_counter() - started_at,
        error,
        exc_info=True,
    )


def _build_semantic_service() -> SemanticSummarizationService:
    return SemanticSummarizationService(
        get_llm_client_fn=get_llm_client,
        load_api_key_fn=load_api_key_for_provider,
        parse_response_fn=parse_summarization_response,
        fallback_facts_fn=extract_fallback_facts,
    )


def _resolve_semantic_health_payload(container: Any) -> Dict[str, Any]:
    config = container.config
    if config.model_mode != "local" and not config.api_key:
        config = load_api_key_for_provider(config)
        if not config.api_key:
            return unhealthy_payload("Semantic provider API key not available")

    llm_client = get_llm_client(config)
    if not llm_client:
        return unhealthy_payload("LLM client not available")

    return healthy_payload(
        message="Semantic summarization service ready",
        model_provider=config.model_provider,
        model_id=config.selected_model_id,
    )


def _resolve_authenticated_semantic_user_id(request_user_id: str) -> str:
    identity = get_current_authenticated_install_identity()
    if identity is None:
        raise HTTPException(
            status_code=401,
            detail="Authenticated install identity required",
        )
    if request_user_id.strip() != identity.user_id:
        raise HTTPException(
            status_code=403,
            detail="Semantic route cannot act as another user",
        )
    return identity.user_id


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_conversations(
    request: SummarizeRequest,
    container: ContainerDep,
    session_manager: SessionManagerDep,
) -> SummarizeResponse:
    """Summarize conversations and extract semantic information."""
    resolved_user_id = _resolve_authenticated_semantic_user_id(request.user_id)
    route_started_at = _log_semantic_route_start(
        route_label="/api/semantic/summarize",
        user_id=resolved_user_id,
        conversation_count=len(request.conversations),
    )
    service = _build_semantic_service()
    try:
        summary, facts = await service.summarize(
            conversations=request.conversations,
            user_id=resolved_user_id,
            container=container,
            session_manager=session_manager,
        )

        logger.info(
            "Summarized %s conversations into %s facts for user %s",
            len(request.conversations),
            len(facts),
            resolved_user_id,
        )
        _log_semantic_route_success(
            route_label="/api/semantic/summarize",
            user_id=resolved_user_id,
            started_at=route_started_at,
            fact_count=len(facts),
        )
        return SummarizeResponse(summary=summary, facts=facts, success=True)
    except Exception as error:
        _log_semantic_route_failure(
            route_label="/api/semantic/summarize",
            user_id=resolved_user_id,
            started_at=route_started_at,
            error=error,
        )
        raise


@router.post("/title", response_model=GenerateTitleResponse)
async def generate_conversation_title(
    request: GenerateTitleRequest,
    container: ContainerDep,
    session_manager: SessionManagerDep,
) -> GenerateTitleResponse:
    """Generate a conversation title using the active user model."""
    resolved_user_id = _resolve_authenticated_semantic_user_id(request.user_id)
    route_started_at = _log_semantic_route_start(
        route_label="/api/semantic/title",
        user_id=resolved_user_id,
        user_chars=len(request.user_message),
        assistant_chars=len(request.assistant_message),
    )
    service = _build_semantic_service()
    try:
        title = await service.generate_title(
            user_message=request.user_message,
            assistant_message=request.assistant_message,
            user_id=resolved_user_id,
            container=container,
            session_manager=session_manager,
            model_id_override=request.model_id,
            model_provider_override=request.model_provider,
        )
        _log_semantic_route_success(
            route_label="/api/semantic/title",
            user_id=resolved_user_id,
            started_at=route_started_at,
            title_chars=len(title),
        )
        return GenerateTitleResponse(title=title, success=True)
    except Exception as error:
        _log_semantic_route_failure(
            route_label="/api/semantic/title",
            user_id=resolved_user_id,
            started_at=route_started_at,
            error=error,
        )
        raise


@router.get("/health")
async def health_check(container: ContainerDep) -> Dict[str, Any]:
    """Health check for semantic summarization service."""
    async def check() -> Dict[str, Any]:
        return _resolve_semantic_health_payload(container)

    return await safe_health_check(
        check,
        logger=logger,
        error_log_prefix="Semantic health check failed",
    )
