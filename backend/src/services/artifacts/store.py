"""
Artifact storage service.

Stores large binary artifacts (screenshots, snapshots) on disk and returns
stable artifact IDs for WS payloads.
"""
from __future__ import annotations

import hashlib
import json
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
        return self.resolve_path_for_owner(artifact_id)

    def resolve_path_for_owner(
        self,
        artifact_id: str,
        owner_user_id: Optional[str] = None,
    ) -> Tuple[Path, str]:
        """Resolve a stored artifact path and optionally enforce owner identity."""
        if not _SAFE_ID_RE.match(artifact_id):
            raise HTTPException(status_code=400, detail="Invalid artifact id")
        path = self.base_dir / artifact_id
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Artifact not found")
        if owner_user_id is not None and not self._artifact_belongs_to_user(
            artifact_id,
            owner_user_id,
        ):
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

    def _metadata_path(self, artifact_id: str) -> Path:
        return self.base_dir / f"{artifact_id}.meta.json"

    def _write_metadata(self, artifact_id: str, *, owner_user_id: Optional[str]) -> None:
        metadata_path = self._metadata_path(artifact_id)
        payload = {}
        if isinstance(owner_user_id, str) and owner_user_id.strip():
            payload["owner_user_id"] = owner_user_id.strip()
        metadata_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    def _artifact_belongs_to_user(self, artifact_id: str, owner_user_id: str) -> bool:
        metadata_path = self._metadata_path(artifact_id)
        if not metadata_path.is_file():
            return False
        try:
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            return False
        stored_owner = payload.get("owner_user_id")
        return isinstance(stored_owner, str) and stored_owner.strip() == owner_user_id

    async def save_upload(
        self,
        upload: UploadFile,
        *,
        owner_user_id: Optional[str] = None,
    ) -> ArtifactMeta:
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

        try:
            self._write_metadata(artifact_id, owner_user_id=owner_user_id)
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

    def save_bytes(
        self,
        data: bytes,
        *,
        content_type: str,
        owner_user_id: Optional[str] = None,
    ) -> ArtifactMeta:
        """Persist generated artifact bytes (for example overlay images)."""
        normalized_content_type = content_type.split(";", 1)[0].strip().lower()
        ext = _CONTENT_TYPE_TO_EXT.get(normalized_content_type)
        if not ext:
            raise HTTPException(status_code=415, detail="Unsupported content type")

        size = len(data)
        if size > self.max_bytes:
            raise HTTPException(status_code=413, detail="Artifact too large")

        artifact_id = f"{uuid4().hex}.{ext}"
        path = self.base_dir / artifact_id
        try:
            path.write_bytes(data)
            self._write_metadata(artifact_id, owner_user_id=owner_user_id)
        except Exception as exc:
            self._cleanup_partial_upload(path)
            raise HTTPException(status_code=500, detail="Artifact upload failed") from exc

        return ArtifactMeta(
            artifact_id=artifact_id,
            content_type=_EXT_TO_CONTENT_TYPE[ext],
            size_bytes=size,
            sha256=hashlib.sha256(data).hexdigest(),
            path=path,
        )

    def load_base64(
        self,
        artifact_id: str,
        owner_user_id: Optional[str] = None,
    ) -> str:
        """Load artifact bytes and return base64-encoded string."""
        import base64

        path, _ = self.resolve_path_for_owner(artifact_id, owner_user_id=owner_user_id)
        if path.stat().st_size > self.max_bytes:
            raise HTTPException(status_code=413, detail="Artifact too large")
        data = path.read_bytes()
        return base64.b64encode(data).decode("utf-8")
