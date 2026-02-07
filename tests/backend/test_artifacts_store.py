import base64
import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile
from starlette.requests import Request

from backend.src.api.routes.artifacts import upload_artifact
from backend.src.core.config.models import AppConfig
from backend.src.services.artifacts import ArtifactStore


@pytest.mark.asyncio
async def test_artifact_store_save_and_resolve(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    data = b"png-data"
    upload = UploadFile(
        filename="shot.png",
        file=io.BytesIO(data),
        content_type="image/png",
    )

    meta = await store.save_upload(upload)
    path, content_type = store.resolve_path(meta.artifact_id)

    assert meta.size_bytes == len(data)
    assert meta.content_type == "image/png"
    assert path.exists()
    assert content_type == "image/png"


@pytest.mark.asyncio
async def test_artifact_store_enforces_size_limit(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=5)
    upload = UploadFile(
        filename="shot.png",
        file=io.BytesIO(b"123456"),
        content_type="image/png",
    )

    with pytest.raises(HTTPException) as exc_info:
        await store.save_upload(upload)

    assert exc_info.value.status_code == 413
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_artifact_store_rejects_unsupported_content_type(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    upload = UploadFile(
        filename="note.txt",
        file=io.BytesIO(b"hello"),
        content_type="text/plain",
    )

    with pytest.raises(HTTPException) as exc_info:
        await store.save_upload(upload)

    assert exc_info.value.status_code == 415


@pytest.mark.asyncio
async def test_artifact_store_rejects_missing_content_type(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    upload = UploadFile(
        filename="shot.png",
        file=io.BytesIO(b"data"),
        content_type=None,
    )

    with pytest.raises(HTTPException) as exc_info:
        await store.save_upload(upload)

    assert exc_info.value.status_code == 400


def test_artifact_store_rejects_invalid_id(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)

    with pytest.raises(HTTPException) as exc_info:
        store.resolve_path("bad.exe")

    assert exc_info.value.status_code == 400


def test_artifact_store_load_base64(tmp_path) -> None:
    store = ArtifactStore(tmp_path, max_bytes=1024)
    data = b"png-data"
    path = tmp_path / "abc123.png"
    path.write_bytes(data)

    encoded = store.load_base64("abc123.png")

    assert encoded == base64.b64encode(data).decode("utf-8")


@pytest.mark.asyncio
async def test_upload_artifact_builds_url(tmp_path) -> None:
    config = AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=1024)
    container = SimpleNamespace(config=config)
    upload = UploadFile(
        filename="shot.png",
        file=io.BytesIO(b"data"),
        content_type="image/png",
    )
    scope = {
        "type": "http",
        "scheme": "http",
        "server": ("testserver", 80),
        "path": "/api/artifacts/",
    }
    request = Request(scope)

    response = await upload_artifact(request, container, file=upload)

    assert response.url.startswith("http://testserver/api/artifacts/")
