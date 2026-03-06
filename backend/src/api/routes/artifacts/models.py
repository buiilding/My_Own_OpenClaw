from __future__ import annotations

from pydantic import BaseModel


class ArtifactUploadResponse(BaseModel):
    artifact_id: str
    content_type: str
    size_bytes: int
    sha256: str
    url: str
