"""REST routes for SDK-facing OCR and vision capabilities."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
    OcrCoordinateResolver,
)
from backend.src.api.deps import ContainerDep
from backend.src.api.routes.sdk.models import (
    OcrCandidateRequest,
    OcrFindTextResponse,
    OcrOverlayRequest,
    OcrResolveCandidateResponse,
    OcrResolveTextResponse,
    OcrRunRequest,
    OcrRunResponse,
    OcrTextQueryRequest,
    OverlayArtifactResponse,
    VisionDescribeRequest,
    VisionDescribeResponse,
    VisionLocateAllRequest,
    VisionLocateAllResponse,
    VisionLocateRequest,
    VisionLocateResponse,
    VisionOverlayRequest,
)
from backend.src.api.routes.sdk.service import (
    build_image_metadata,
    build_ocr_results,
    build_vision_locate_all_response,
    build_vision_locate_response,
    crop_image_source,
    describe_image_region,
    raise_ocr_resolution_error,
    rank_ocr_matches,
    render_ocr_overlay_response,
    render_vision_overlay_response,
    resolve_image_source,
    run_ocr,
)

router = APIRouter(prefix="/api/sdk", tags=["sdk"])
logger = logging.getLogger(__name__)


@router.post("/ocr/run", response_model=OcrRunResponse)
async def sdk_ocr_run(
    request: OcrRunRequest,
    container: ContainerDep,
) -> OcrRunResponse:
    source = resolve_image_source(request.image, container)
    ocr_results = await run_ocr(source, container)
    return OcrRunResponse(
        image=build_image_metadata(source),
        results=build_ocr_results(ocr_results, source_id=source.source_id),
    )


@router.post("/ocr/find-text", response_model=OcrFindTextResponse)
async def sdk_ocr_find_text(
    request: OcrTextQueryRequest,
    container: ContainerDep,
) -> OcrFindTextResponse:
    source = resolve_image_source(request.image, container)
    ocr_results = await run_ocr(source, container)
    ranked = rank_ocr_matches(request.text, ocr_results, source_id=source.source_id)
    matches = [
        match
        for match in ranked
        if float(match.score or 0.0) >= request.threshold
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
    return OcrFindTextResponse(
        image=build_image_metadata(source),
        query=request.text,
        threshold=request.threshold,
        matches=ranked[: request.max_results],
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
    except Exception as exc:
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
        raise HTTPException(status_code=500, detail="Resolved OCR point did not map back to a candidate")
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
        raise HTTPException(status_code=404, detail="OCR candidate not found for the provided image")
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
    source = resolve_image_source(payload.image, container)
    ocr_results = await run_ocr(source, container)
    if payload.candidate_id:
        rows = build_ocr_results(ocr_results, source_id=source.source_id)
        rows = [row for row in rows if row.candidate_id == payload.candidate_id]
        if not rows:
            raise HTTPException(status_code=404, detail="OCR candidate not found for overlay")
    elif payload.text:
        ranked = rank_ocr_matches(payload.text, ocr_results, source_id=source.source_id)
        rows = [
            row
            for row in ranked
            if float(row.score or 0.0) >= payload.threshold
        ][: payload.max_results]
    else:
        rows = build_ocr_results(ocr_results, source_id=source.source_id)[: payload.max_results]

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
