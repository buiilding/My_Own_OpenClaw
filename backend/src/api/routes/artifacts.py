"""
Artifact API Routes.

HTTP endpoints for uploading and retrieving large artifacts (screenshots).
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.src.api.deps import ContainerDep
from backend.src.services.artifacts import ArtifactStore

router = APIRouter(prefix="/api/artifacts", tags=["artifacts"])
logger = logging.getLogger(__name__)


class ArtifactUploadResponse(BaseModel):
    artifact_id: str
    content_type: str
    size_bytes: int
    sha256: str
    url: str


@router.post("/", response_model=ArtifactUploadResponse)
async def upload_artifact(
    request: Request,
    container: ContainerDep,
    file: UploadFile = File(...),
) -> ArtifactUploadResponse:
    """Upload an artifact (multipart/form-data)."""
    store = ArtifactStore.from_config(container.config)
    meta = await store.save_upload(file)
    base_url = str(request.base_url).rstrip("/")
    url = f"{base_url}/api/artifacts/{meta.artifact_id}"
    return ArtifactUploadResponse(
        artifact_id=meta.artifact_id,
        content_type=meta.content_type,
        size_bytes=meta.size_bytes,
        sha256=meta.sha256,
        url=url,
    )


@router.get("/{artifact_id}")
async def get_artifact(
    artifact_id: str,
    container: ContainerDep,
) -> FileResponse:
    """Fetch an artifact by ID."""
    store = ArtifactStore.from_config(container.config)
    try:
        path, content_type = store.resolve_path(artifact_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to resolve artifact: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Artifact lookup failed") from exc
    return FileResponse(path, media_type=content_type)
