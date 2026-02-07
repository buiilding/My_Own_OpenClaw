import base64
import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request

from backend.src.core.config.models import AppConfig
from backend.src.services.artifacts import ArtifactStore


class BrokenUpload:
    def __init__(self, content_type="image/png"):
        self.content_type = content_type
        self._reads = 0

    async def read(self, _chunk_size):
        self._reads += 1
        if self._reads == 1:
            return b"partial-bytes"
        raise RuntimeError("stream error")


def _upload_file(data: bytes, filename: str, content_type: str | None) -> UploadFile:
    headers = Headers({"content-type": content_type}) if content_type else Headers()
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        headers=headers,
    )


@pytest.mark.asyncio
async def test_artifact_store_save_and_resolve(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    data = b"png-data"
    upload = _upload_file(data, "shot.png", "image/png")

    meta = await store.save_upload(upload)
    path, content_type = store.resolve_path(meta.artifact_id)

    assert meta.size_bytes == len(data)
    assert meta.content_type == "image/png"
    assert path.exists()
    assert content_type == "image/png"


@pytest.mark.asyncio
async def test_artifact_store_normalizes_content_type_with_parameters(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    upload = _upload_file(b"png-data", "shot.png", "IMAGE/PNG; charset=binary")

    meta = await store.save_upload(upload)
    path, content_type = store.resolve_path(meta.artifact_id)

    assert meta.content_type == "image/png"
    assert content_type == "image/png"
    assert path.exists()


@pytest.mark.asyncio
async def test_artifact_store_enforces_size_limit(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=5)
    upload = _upload_file(b"123456", "shot.png", "image/png")

    with pytest.raises(HTTPException) as exc_info:
        await store.save_upload(upload)

    assert exc_info.value.status_code == 413
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_artifact_store_rejects_unsupported_content_type(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    upload = _upload_file(b"hello", "note.txt", "text/plain")

    with pytest.raises(HTTPException) as exc_info:
        await store.save_upload(upload)

    assert exc_info.value.status_code == 415


@pytest.mark.asyncio
async def test_artifact_store_rejects_missing_content_type(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    upload = _upload_file(b"data", "shot.png", None)

    with pytest.raises(HTTPException) as exc_info:
        await store.save_upload(upload)

    assert exc_info.value.status_code == 400


def test_artifact_store_rejects_invalid_id(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)

    with pytest.raises(HTTPException) as exc_info:
        store.resolve_path("bad.exe")

    assert exc_info.value.status_code == 400


def test_artifact_store_missing_id_returns_not_found(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)

    with pytest.raises(HTTPException) as exc_info:
        store.resolve_path("abc123.png")

    assert exc_info.value.status_code == 404


def test_artifact_store_load_base64(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    data = b"png-data"
    path = tmp_path / "abc123.png"
    path.write_bytes(data)

    encoded = store.load_base64("abc123.png")

    assert encoded == base64.b64encode(data).decode("utf-8")


def test_artifact_store_load_base64_enforces_max_bytes(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=4)
    path = tmp_path / "abc123.png"
    path.write_bytes(b"12345")

    with pytest.raises(HTTPException) as exc_info:
        store.load_base64("abc123.png")

    assert exc_info.value.status_code == 413


@pytest.mark.asyncio
async def test_artifact_store_cleans_up_partial_file_on_read_failure(tmp_path, monkeypatch) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    monkeypatch.setattr(
        "backend.src.services.artifacts.store.uuid4",
        lambda: SimpleNamespace(hex="fixedid"),
    )

    with pytest.raises(HTTPException) as exc_info:
        await store.save_upload(BrokenUpload())

    assert exc_info.value.status_code == 500
    assert not (tmp_path / "fixedid.png").exists()


@pytest.mark.asyncio
async def test_upload_artifact_builds_url(tmp_path) -> None:
    try:
        from backend.src.api.routes.artifacts import upload_artifact
    except RuntimeError as exc:
        if "python-multipart" in str(exc):
            pytest.skip("python-multipart not installed in test environment")
        raise

    config = AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=1024)
    container = SimpleNamespace(config=config)
    upload = _upload_file(b"data", "shot.png", "image/png")
    scope = {
        "type": "http",
        "scheme": "http",
        "server": ("testserver", 80),
        "path": "/api/artifacts/",
    }
    request = Request(scope)

    response = await upload_artifact(request, container, file=upload)

    assert response.url.startswith("http://testserver/api/artifacts/")
