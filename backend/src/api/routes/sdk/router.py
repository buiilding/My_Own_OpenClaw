"""REST routes for SDK-facing OCR and vision capabilities."""

from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
    OcrCoordinateResolver,
)
from backend.src.api.auth.context import get_current_authenticated_install_identity
from backend.src.api.deps import ContainerDep, SessionManagerDep
from backend.src.api.routes.sdk.models import (
    DebugModelsResponse,
    DebugSystemPromptResponse,
    DebugToolCapabilitiesResponse,
    DebugToolSchemasResponse,
    OcrCandidateRequest,
    OcrFindTextResponse,
    OcrInspectRequest,
    OcrInspectResponse,
    OcrOverlayRequest,
    OcrResolutionErrorModel,
    OcrResolveCandidateResponse,
    OcrResolveTextResponse,
    OcrRunRequest,
    OcrRunResponse,
    OcrTextQueryRequest,
    OverlayArtifactResponse,
    PromptPreviewRequest,
    PromptPreviewResponse,
    QueryPlanRequest,
    QueryPlanResponse,
    VisionDescribeRequest,
    VisionDescribeResponse,
    VisionLocateAllRequest,
    VisionLocateAllResponse,
    VisionLocateRequest,
    VisionLocateResponse,
    VisionOverlayRequest,
)
from backend.src.api.routes.sdk.service import (
    build_debug_config_snapshot,
    build_debug_tool_schemas,
    build_image_metadata,
    build_ocr_resolution_error,
    build_ocr_results,
    build_prompt_constructor,
    build_prompt_preview,
    build_query_plan,
    build_vision_locate_all_response,
    build_vision_locate_response,
    crop_image_source,
    describe_image_region,
    get_debug_tool_capabilities,
    list_debug_models,
    raise_ocr_resolution_error,
    rank_ocr_matches,
    render_ocr_overlay_response,
    render_vision_overlay_response,
    resolve_effective_debug_config,
    resolve_image_source,
    run_ocr,
)

router = APIRouter(prefix="/api/sdk", tags=["sdk"])
logger = logging.getLogger(__name__)


InteractionModeQuery = Optional[Literal["chat", "agent"]]


def require_sdk_debug_identity(
    payload_user_id: Optional[str],
    *,
    context_label: str = "SDK debug query plan",
):
    identity = require_authenticated_sdk_identity()
    if (
        isinstance(payload_user_id, str)
        and payload_user_id.strip()
        and payload_user_id.strip() != identity.user_id
    ):
        raise HTTPException(
            status_code=403,
            detail=f"{context_label} cannot inspect another user's context",
        )
    return identity


def require_authenticated_sdk_identity():
    identity = get_current_authenticated_install_identity()
    if identity is None:
        raise HTTPException(
            status_code=401,
            detail="Authenticated install identity required",
        )
    return identity


def reject_untrusted_query_plan_workspace(workspace_path: Optional[str]) -> None:
    if isinstance(workspace_path, str) and workspace_path.strip():
        raise HTTPException(
            status_code=403,
            detail="SDK debug query plan does not accept payload-selected workspace paths",
        )


@router.post("/ocr/run", response_model=OcrRunResponse)
async def sdk_ocr_run(
    request: OcrRunRequest,
    container: ContainerDep,
) -> OcrRunResponse:
    require_authenticated_sdk_identity()
    source = resolve_image_source(request.image, container)
    ocr_results = await run_ocr(source, container)
    return OcrRunResponse(
        image=build_image_metadata(source),
        results=build_ocr_results(ocr_results, source_id=source.source_id),
    )


@router.post("/ocr/inspect", response_model=OcrInspectResponse)
async def sdk_ocr_inspect(
    request: Request,
    payload: OcrInspectRequest,
    container: ContainerDep,
) -> OcrInspectResponse:
    source = resolve_image_source(payload.image, container)
    ocr_results = await run_ocr(source, container)
    results = build_ocr_results(ocr_results, source_id=source.source_id)

    ranked_matches = []
    accepted_matches = []
    resolved_match = None
    resolution_error = None

    if payload.text:
        ranked_matches = rank_ocr_matches(
            payload.text,
            ocr_results,
            source_id=source.source_id,
        )[: payload.max_results]
        accepted_matches = [
            match
            for match in ranked_matches
            if float(match.score or 0.0) >= payload.threshold
        ]
        try:
            x, y = OcrCoordinateResolver.resolve(
                payload.text,
                ocr_results,
                threshold=payload.threshold,
                screenshot_id=source.source_id,
            )
            resolved_match = next(
                (
                    candidate
                    for candidate in ranked_matches
                    if candidate.center is not None
                    and candidate.center.x == x
                    and candidate.center.y == y
                ),
                None,
            )
        except ValueError as exc:
            status_code, detail = build_ocr_resolution_error(exc)
            resolution_error = OcrResolutionErrorModel(
                status_code=status_code,
                detail=detail,
            )

    overlay = None
    if payload.include_overlay:
        overlay_rows = (
            accepted_matches if payload.text else results[: payload.max_results]
        )
        overlay = render_ocr_overlay_response(
            request=request,
            container=container,
            source=source,
            rows=overlay_rows,
            show_labels=payload.show_labels,
        )

    return OcrInspectResponse(
        image=build_image_metadata(source),
        query=payload.text,
        threshold=payload.threshold,
        results=results,
        ranked_matches=ranked_matches,
        accepted_matches=accepted_matches,
        resolved_match=resolved_match,
        resolution_error=resolution_error,
        overlay=overlay,
    )


@router.post("/ocr/find-text", response_model=OcrFindTextResponse)
async def sdk_ocr_find_text(
    request: OcrTextQueryRequest,
    container: ContainerDep,
) -> OcrFindTextResponse:
    require_authenticated_sdk_identity()
    source = resolve_image_source(request.image, container)
    ocr_results = await run_ocr(source, container)
    ranked = rank_ocr_matches(request.text, ocr_results, source_id=source.source_id)
    matches = [
        match for match in ranked if float(match.score or 0.0) >= request.threshold
    ][: request.max_results]
    return OcrFindTextResponse(
        image=build_image_metadata(source),
        query=request.text,
        threshold=request.threshold,
        matches=matches,
    )


@router.post("/ocr/find-text-candidates", response_model=OcrFindTextResponse)
async def sdk_ocr_find_text_candidates(
    request: OcrTextQueryRequest,
    container: ContainerDep,
) -> OcrFindTextResponse:
    source = resolve_image_source(request.image, container)
    ocr_results = await run_ocr(source, container)
    ranked = rank_ocr_matches(request.text, ocr_results, source_id=source.source_id)
    matches = [
        match for match in ranked if float(match.score or 0.0) >= request.threshold
    ][: request.max_results]
    return OcrFindTextResponse(
        image=build_image_metadata(source),
        query=request.text,
        threshold=request.threshold,
        matches=matches,
    )


@router.post("/ocr/resolve-text", response_model=OcrResolveTextResponse)
async def sdk_ocr_resolve_text(
    request: OcrTextQueryRequest,
    container: ContainerDep,
) -> OcrResolveTextResponse:
    source = resolve_image_source(request.image, container)
    ocr_results = await run_ocr(source, container)
    try:
        x, y = OcrCoordinateResolver.resolve(
            request.text,
            ocr_results,
            threshold=request.threshold,
            screenshot_id=source.source_id,
        )
    except ValueError as exc:
        raise_ocr_resolution_error(exc)

    ranked = rank_ocr_matches(request.text, ocr_results, source_id=source.source_id)
    match = next(
        (
            candidate
            for candidate in ranked
            if candidate.center is not None
            and candidate.center.x == x
            and candidate.center.y == y
        ),
        None,
    )
    if match is None:
        raise HTTPException(
            status_code=500, detail="Resolved OCR point did not map back to a candidate"
        )
    return OcrResolveTextResponse(
        image=build_image_metadata(source),
        query=request.text,
        threshold=request.threshold,
        match=match,
    )


@router.post("/ocr/resolve-candidate", response_model=OcrResolveCandidateResponse)
async def sdk_ocr_resolve_candidate(
    request: OcrCandidateRequest,
    container: ContainerDep,
) -> OcrResolveCandidateResponse:
    source = resolve_image_source(request.image, container)
    ocr_results = await run_ocr(source, container)
    resolved = None
    normalized = build_ocr_results(ocr_results, source_id=source.source_id)
    for row in normalized:
        if row.candidate_id == request.candidate_id:
            resolved = row
            break
    if resolved is None:
        raise HTTPException(
            status_code=404, detail="OCR candidate not found for the provided image"
        )
    return OcrResolveCandidateResponse(
        image=build_image_metadata(source),
        candidate_id=request.candidate_id,
        match=resolved,
    )


@router.post("/ocr/overlay", response_model=OverlayArtifactResponse)
async def sdk_ocr_overlay(
    request: Request,
    payload: OcrOverlayRequest,
    container: ContainerDep,
) -> OverlayArtifactResponse:
    require_authenticated_sdk_identity()
    source = resolve_image_source(payload.image, container)
    ocr_results = await run_ocr(source, container)
    if payload.candidate_id:
        rows = build_ocr_results(ocr_results, source_id=source.source_id)
        rows = [row for row in rows if row.candidate_id == payload.candidate_id]
        if not rows:
            raise HTTPException(
                status_code=404, detail="OCR candidate not found for overlay"
            )
    elif payload.text:
        ranked = rank_ocr_matches(payload.text, ocr_results, source_id=source.source_id)
        rows = [row for row in ranked if float(row.score or 0.0) >= payload.threshold][
            : payload.max_results
        ]
    else:
        rows = build_ocr_results(ocr_results, source_id=source.source_id)[
            : payload.max_results
        ]

    return render_ocr_overlay_response(
        request=request,
        container=container,
        source=source,
        rows=rows,
        show_labels=payload.show_labels,
    )


@router.post("/vision/locate", response_model=VisionLocateResponse)
async def sdk_vision_locate(
    request: VisionLocateRequest,
    container: ContainerDep,
) -> VisionLocateResponse:
    source = resolve_image_source(request.image, container)
    return await build_vision_locate_response(
        source=source,
        description=request.description,
        container=container,
    )


@router.post("/vision/locate-all", response_model=VisionLocateAllResponse)
async def sdk_vision_locate_all(
    request: VisionLocateAllRequest,
    container: ContainerDep,
) -> VisionLocateAllResponse:
    require_authenticated_sdk_identity()
    source = resolve_image_source(request.image, container)
    return await build_vision_locate_all_response(
        source=source,
        description=request.description,
        max_results=request.max_results,
        container=container,
    )


@router.post("/vision/describe", response_model=VisionDescribeResponse)
async def sdk_vision_describe(
    request: VisionDescribeRequest,
    container: ContainerDep,
) -> VisionDescribeResponse:
    source = resolve_image_source(request.image, container)
    region = request.region
    if region is not None:
        source, region = crop_image_source(source, region)
    description = await describe_image_region(source=source, container=container)
    return VisionDescribeResponse(
        image=build_image_metadata(source),
        region=region,
        description=description,
    )


@router.post("/vision/overlay", response_model=OverlayArtifactResponse)
async def sdk_vision_overlay(
    request: Request,
    payload: VisionOverlayRequest,
    container: ContainerDep,
) -> OverlayArtifactResponse:
    source = resolve_image_source(payload.image, container)
    return render_vision_overlay_response(
        request=request,
        container=container,
        source=source,
        points=payload.result.points,
        regions=payload.result.regions,
        show_labels=payload.show_labels,
    )


@router.get("/models", response_model=DebugModelsResponse)
async def sdk_debug_models(
    container: ContainerDep,
    session_manager: SessionManagerDep,
    user_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    model_provider: Optional[str] = Query(None),
    interaction_mode: InteractionModeQuery = Query(None),
) -> DebugModelsResponse:
    identity = require_sdk_debug_identity(
        user_id,
        context_label="SDK debug models",
    )
    config = resolve_effective_debug_config(
        container=container,
        session_manager=session_manager,
        user_id=identity.user_id,
        model_id=model_id,
        model_provider=model_provider,
        interaction_mode=interaction_mode,
    )
    models = await list_debug_models(config=config, container=container)
    return DebugModelsResponse(
        config=build_debug_config_snapshot(config),
        models=models,
    )


@router.get("/tool-schemas", response_model=DebugToolSchemasResponse)
async def sdk_debug_tool_schemas(
    container: ContainerDep,
    session_manager: SessionManagerDep,
    user_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    model_provider: Optional[str] = Query(None),
    interaction_mode: InteractionModeQuery = Query(None),
) -> DebugToolSchemasResponse:
    identity = require_sdk_debug_identity(
        user_id,
        context_label="SDK debug tool schemas",
    )
    config = resolve_effective_debug_config(
        container=container,
        session_manager=session_manager,
        user_id=identity.user_id,
        model_id=model_id,
        model_provider=model_provider,
        interaction_mode=interaction_mode,
    )
    canonical_tool_schemas, provider_tool_schemas = build_debug_tool_schemas(
        config=config,
        container=container,
    )
    return DebugToolSchemasResponse(
        config=build_debug_config_snapshot(config),
        canonical_tool_schemas=canonical_tool_schemas,
        provider_tool_schemas=provider_tool_schemas,
    )


@router.get(
    "/tool-capabilities/{tool_name}", response_model=DebugToolCapabilitiesResponse
)
async def sdk_debug_tool_capabilities(
    tool_name: str,
    container: ContainerDep,
    session_manager: SessionManagerDep,
    user_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    model_provider: Optional[str] = Query(None),
    interaction_mode: InteractionModeQuery = Query(None),
) -> DebugToolCapabilitiesResponse:
    config = resolve_effective_debug_config(
        container=container,
        session_manager=session_manager,
        user_id=user_id,
        model_id=model_id,
        model_provider=model_provider,
        interaction_mode=interaction_mode,
    )
    capability, canonical_tool_schema, provider_tool_schema = (
        get_debug_tool_capabilities(
            tool_name=tool_name,
            config=config,
            container=container,
        )
    )
    return DebugToolCapabilitiesResponse(
        config=build_debug_config_snapshot(config),
        capability=capability,
        canonical_tool_schema=canonical_tool_schema,
        provider_tool_schema=provider_tool_schema,
    )


@router.get("/system-prompt", response_model=DebugSystemPromptResponse)
async def sdk_debug_system_prompt(
    container: ContainerDep,
    session_manager: SessionManagerDep,
    user_id: Optional[str] = Query(None),
    model_id: Optional[str] = Query(None),
    model_provider: Optional[str] = Query(None),
    interaction_mode: InteractionModeQuery = Query(None),
) -> DebugSystemPromptResponse:
    identity = require_sdk_debug_identity(
        user_id,
        context_label="SDK debug system prompt",
    )
    config = resolve_effective_debug_config(
        container=container,
        session_manager=session_manager,
        user_id=identity.user_id,
        model_id=model_id,
        model_provider=model_provider,
        interaction_mode=interaction_mode,
    )
    constructor = build_prompt_constructor(config=config, container=container)
    return DebugSystemPromptResponse(
        config=build_debug_config_snapshot(config),
        system_prompt=constructor.system_prompt,
    )


@router.post("/prompt-preview", response_model=PromptPreviewResponse)
async def sdk_debug_prompt_preview(
    payload: PromptPreviewRequest,
    container: ContainerDep,
    session_manager: SessionManagerDep,
) -> PromptPreviewResponse:
    identity = require_sdk_debug_identity(
        payload.user_id,
        context_label="SDK debug prompt preview",
    )
    config = resolve_effective_debug_config(
        container=container,
        session_manager=session_manager,
        user_id=identity.user_id,
        model_id=payload.model_id,
        model_provider=payload.model_provider,
        interaction_mode=payload.interaction_mode,
    )
    preview = build_prompt_preview(
        config=config,
        container=container,
        messages=payload.messages,
        user_query_raw=payload.user_query_raw,
        include_tools=payload.include_tools,
        workspace_path=payload.workspace_path,
        agent_definition=payload.agent_definition,
    )
    return PromptPreviewResponse(
        config=build_debug_config_snapshot(config),
        system_prompt=preview["system_prompt"],
        prompt_messages=preview["prompt_messages"],
        canonical_tool_schemas=preview["canonical_tool_schemas"],
        provider_tool_schemas=preview["provider_tool_schemas"],
        user_message_full=preview["user_message_full"],
        prompt_token_count=preview["prompt_token_count"],
        token_count_error=preview["token_count_error"],
    )


@router.post("/query-plan", response_model=QueryPlanResponse)
async def sdk_debug_query_plan(
    payload: QueryPlanRequest,
    container: ContainerDep,
    session_manager: SessionManagerDep,
) -> QueryPlanResponse:
    identity = require_sdk_debug_identity(payload.user_id)
    reject_untrusted_query_plan_workspace(payload.workspace_path)
    config = resolve_effective_debug_config(
        container=container,
        session_manager=session_manager,
        user_id=identity.user_id,
        model_id=payload.model_id,
        model_provider=payload.model_provider,
        interaction_mode=payload.interaction_mode,
    )
    plan = build_query_plan(
        config=config,
        container=container,
        messages=payload.messages,
        user_query_raw=payload.user_query_raw,
        include_tools=payload.include_tools,
        workspace_path=payload.workspace_path,
        agent_definition=payload.agent_definition,
        conversation_ref=payload.conversation_ref,
    )
    return QueryPlanResponse(
        config=build_debug_config_snapshot(config),
        query_message=plan["query_message"],
        transparency_events=plan["transparency_events"],
        system_prompt=plan["system_prompt"],
        prompt_messages=plan["prompt_messages"],
        canonical_tool_schemas=plan["canonical_tool_schemas"],
        provider_tool_schemas=plan["provider_tool_schemas"],
        user_message_full=plan["user_message_full"],
        prompt_token_count=plan["prompt_token_count"],
        token_count_error=plan["token_count_error"],
    )
