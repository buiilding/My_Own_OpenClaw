"""
Artifact storage service.

Stores large binary artifacts (screenshots, snapshots) on disk and returns
stable artifact IDs for WS payloads.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from backend.src.core.config import AppConfig

_SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$")

_CONTENT_TYPE_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
}

_EXT_TO_CONTENT_TYPE = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
}
_UPLOAD_CHUNK_SIZE_BYTES = 1024 * 1024


@dataclass(frozen=True)
class ArtifactMeta:
    artifact_id: str
    content_type: str
    size_bytes: int
    sha256: str
    path: Path


class ArtifactStore:
    """
    Store artifacts on local disk with size limits and strict ID validation.
    """

    def __init__(self, base_dir: Path, max_bytes: int) -> None:
        self.base_dir = base_dir
        self.max_bytes = max_bytes
        self.base_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_config(cls, config: AppConfig) -> "ArtifactStore":
        return cls(Path(config.artifact_store_path), config.artifact_max_bytes)

    def resolve_path(self, artifact_id: str) -> Tuple[Path, str]:
        """Resolve a stored artifact path and content type."""
        if not _SAFE_ID_RE.match(artifact_id):
            raise HTTPException(status_code=400, detail="Invalid artifact id")
        path = self.base_dir / artifact_id
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Artifact not found")
        content_type = _EXT_TO_CONTENT_TYPE.get(path.suffix.lstrip("."), "application/octet-stream")
        return path, content_type

    def _resolve_upload_extension(self, upload: UploadFile) -> str:
        """Resolve file extension for an upload content type."""
        if not upload.content_type:
            raise HTTPException(status_code=400, detail="Missing content type")
        normalized_content_type = upload.content_type.split(";", 1)[0].strip().lower()
        ext = _CONTENT_TYPE_TO_EXT.get(normalized_content_type)
        if not ext:
            raise HTTPException(status_code=415, detail="Unsupported content type")
        return ext

    @staticmethod
    def _cleanup_partial_upload(path: Path) -> None:
        """Delete any partially-written artifact after failed upload."""
        if path.exists():
            path.unlink(missing_ok=True)

    async def save_upload(self, upload: UploadFile) -> ArtifactMeta:
        """Save an uploaded file to disk with size enforcement."""
        ext = self._resolve_upload_extension(upload)

        artifact_id = f"{uuid4().hex}.{ext}"
        path = self.base_dir / artifact_id

        hasher = hashlib.sha256()
        size = 0

        try:
            with path.open("wb") as handle:
                while True:
                    chunk = await upload.read(_UPLOAD_CHUNK_SIZE_BYTES)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > self.max_bytes:
                        raise HTTPException(status_code=413, detail="Artifact too large")
                    hasher.update(chunk)
                    handle.write(chunk)
        except HTTPException:
            self._cleanup_partial_upload(path)
            raise
        except Exception as exc:
            self._cleanup_partial_upload(path)
            raise HTTPException(status_code=500, detail="Artifact upload failed") from exc

        return ArtifactMeta(
            artifact_id=artifact_id,
            content_type=_EXT_TO_CONTENT_TYPE[ext],
            size_bytes=size,
            sha256=hasher.hexdigest(),
            path=path,
        )

    def load_base64(self, artifact_id: str) -> str:
        """Load artifact bytes and return base64-encoded string."""
        import base64

        path, _ = self.resolve_path(artifact_id)
        if path.stat().st_size > self.max_bytes:
            raise HTTPException(status_code=413, detail="Artifact too large")
        data = path.read_bytes()
        return base64.b64encode(data).decode("utf-8")
