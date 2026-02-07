import io
import sys
import types
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request
from starlette.responses import FileResponse

from backend.src.core.config.models import AppConfig

# Test-only shim: avoid importing full app container dependencies during route import.
_original_deps = sys.modules.get("backend.src.api.deps")
fake_deps = types.ModuleType("backend.src.api.deps")
fake_deps.ContainerDep = object
fake_deps.SessionManagerDep = object
fake_deps.HandlerRegistryDep = object
sys.modules["backend.src.api.deps"] = fake_deps

try:
    from backend.src.api.routes import artifacts as artifacts_routes
except RuntimeError as exc:
    if "python-multipart" in str(exc):
        pytest.skip("python-multipart not installed in test environment", allow_module_level=True)
    raise
finally:
    if _original_deps is not None:
        sys.modules["backend.src.api.deps"] = _original_deps
    else:
        sys.modules.pop("backend.src.api.deps", None)


def _upload_file(data: bytes, filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


@pytest.mark.asyncio
async def test_get_artifact_returns_file_response(tmp_path) -> None:
    path = tmp_path / "abc123.png"
    path.write_bytes(b"png-bytes")
    container = SimpleNamespace(
        config=AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=1024)
    )

    response = await artifacts_routes.get_artifact("abc123.png", container)

    assert isinstance(response, FileResponse)
    assert response.path == str(path)
    assert response.media_type == "image/png"


@pytest.mark.asyncio
async def test_get_artifact_invalid_id_returns_400(tmp_path) -> None:
    container = SimpleNamespace(
        config=AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=1024)
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.get_artifact("not-an-image.txt", container)

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_artifact_missing_file_returns_404(tmp_path) -> None:
    container = SimpleNamespace(
        config=AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=1024)
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.get_artifact("abc123.png", container)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_artifact_wraps_unexpected_errors_with_500(tmp_path, monkeypatch) -> None:
    container = SimpleNamespace(
        config=AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=1024)
    )

    class BrokenStore:
        def resolve_path(self, _artifact_id: str):
            raise RuntimeError("disk read failure")

    monkeypatch.setattr(
        artifacts_routes.ArtifactStore,
        "from_config",
        classmethod(lambda _cls, _cfg: BrokenStore()),
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.get_artifact("abc123.png", container)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == "Artifact lookup failed"


@pytest.mark.asyncio
async def test_upload_artifact_returns_metadata_and_url(tmp_path) -> None:
    container = SimpleNamespace(
        config=AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=1024)
    )
    upload = _upload_file(b"png-bytes", "shot.png", "image/png")
    request = Request(
        {
            "type": "http",
            "scheme": "http",
            "server": ("testserver", 80),
            "path": "/api/artifacts/",
        }
    )

    response = await artifacts_routes.upload_artifact(request, container, file=upload)

    assert response.content_type == "image/png"
    assert response.size_bytes == len(b"png-bytes")
    assert response.artifact_id.endswith(".png")
    assert response.url == f"http://testserver/api/artifacts/{response.artifact_id}"
    assert len(response.sha256) == 64


@pytest.mark.asyncio
async def test_upload_artifact_enforces_size_limit(tmp_path) -> None:
    container = SimpleNamespace(
        config=AppConfig(artifact_store_path=str(tmp_path), artifact_max_bytes=4)
    )
    upload = _upload_file(b"png-bytes", "shot.png", "image/png")
    request = Request(
        {
            "type": "http",
            "scheme": "http",
            "server": ("testserver", 80),
            "path": "/api/artifacts/",
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.upload_artifact(request, container, file=upload)

    assert exc_info.value.status_code == 413
