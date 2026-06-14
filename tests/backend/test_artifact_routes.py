"""Covers artifact routes behavior in the backend test suite."""

import io
from importlib import import_module
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request
from starlette.responses import FileResponse

from backend.src.api.auth.context import (
    AuthenticatedInstallIdentity,
    reset_current_authenticated_install_identity,
    set_current_authenticated_install_identity,
)
from backend.src.core.config.models import AppConfig
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

# Test-only shim: avoid importing full app container dependencies during route import.
_original_deps = install_route_deps_shim()

try:
    artifacts_routes = import_module("backend.src.api.routes.artifacts.router")
except RuntimeError as exc:
    if "python-multipart" in str(exc):
        pytest.skip(
            "python-multipart not installed in test environment",
            allow_module_level=True,
        )
    raise
finally:
    restore_route_deps_shim(_original_deps)


def _upload_file(data: bytes, filename: str, content_type: str) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(data),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def _container(tmp_path, *, artifact_max_bytes: int = 1024) -> SimpleNamespace:
    return SimpleNamespace(
        config=AppConfig(
            artifact_store_path=str(tmp_path),
            artifact_max_bytes=artifact_max_bytes,
        )
    )


def _artifact_request(*, host: str = "testserver") -> Request:
    return Request(
        {
            "type": "http",
            "scheme": "http",
            "server": ("testserver", 80),
            "path": "/api/artifacts/",
            "headers": [(b"host", host.encode("ascii"))],
        }
    )


@pytest.fixture
def authenticated_install_identity():
    identity = AuthenticatedInstallIdentity(
        user_id="user-artifacts",
        install_id="install-artifacts",
    )
    token = set_current_authenticated_install_identity(identity)
    try:
        yield identity
    finally:
        reset_current_authenticated_install_identity(token)


@pytest.mark.asyncio
async def test_get_artifact_returns_file_response(
    tmp_path, authenticated_install_identity
) -> None:
    path = tmp_path / "abc123.png"
    path.write_bytes(b"png-bytes")
    (tmp_path / "abc123.png.meta.json").write_text(
        '{"owner_user_id":"user-artifacts"}',
        encoding="utf-8",
    )
    container = _container(tmp_path)

    response = await artifacts_routes.get_artifact("abc123.png", container)

    assert isinstance(response, FileResponse)
    assert str(response.path) == str(path)
    assert response.media_type == "image/png"


@pytest.mark.asyncio
async def test_get_artifact_invalid_id_returns_400(
    tmp_path, authenticated_install_identity
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.get_artifact("not-an-image.txt", container)

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_artifact_missing_file_returns_404(
    tmp_path, authenticated_install_identity
) -> None:
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.get_artifact("abc123.png", container)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_artifact_rejects_different_authenticated_owner(
    tmp_path,
    authenticated_install_identity,
) -> None:
    _ = authenticated_install_identity
    path = tmp_path / "abc123.png"
    path.write_bytes(b"png-bytes")
    (tmp_path / "abc123.png.meta.json").write_text(
        '{"owner_user_id":"user-other"}',
        encoding="utf-8",
    )
    container = _container(tmp_path)

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.get_artifact("abc123.png", container)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_artifact_wraps_unexpected_errors_with_500(
    tmp_path,
    monkeypatch,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)

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
async def test_upload_artifact_returns_metadata_and_url(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)
    upload = _upload_file(b"png-bytes", "shot.png", "image/png")
    request = _artifact_request()

    response = await artifacts_routes.upload_artifact(request, container, file=upload)

    assert response.content_type == "image/png"
    assert response.size_bytes == len(b"png-bytes")
    assert response.artifact_id.endswith(".png")
    assert response.url == f"/api/artifacts/{response.artifact_id}"
    assert len(response.sha256) == 64


@pytest.mark.asyncio
async def test_upload_artifact_returns_relative_url_for_forged_host(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path)
    upload = _upload_file(b"png-bytes", "shot.png", "image/png")
    request = _artifact_request(host="attacker.example")

    response = await artifacts_routes.upload_artifact(request, container, file=upload)

    assert response.url == f"/api/artifacts/{response.artifact_id}"
    assert "attacker.example" not in response.url


@pytest.mark.asyncio
async def test_upload_artifact_enforces_size_limit(
    tmp_path,
    authenticated_install_identity,
) -> None:
    container = _container(tmp_path, artifact_max_bytes=4)
    upload = _upload_file(b"png-bytes", "shot.png", "image/png")
    request = _artifact_request()

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.upload_artifact(request, container, file=upload)

    assert exc_info.value.status_code == 413


@pytest.mark.asyncio
async def test_upload_artifact_requires_authenticated_identity(
    tmp_path, monkeypatch
) -> None:
    container = _container(tmp_path)
    upload = _upload_file(b"png-bytes", "shot.png", "image/png")
    request = _artifact_request()

    def fail_from_config(_cfg):
        raise AssertionError("ArtifactStore should not be constructed without identity")

    monkeypatch.setattr(
        artifacts_routes.ArtifactStore,
        "from_config",
        classmethod(lambda _cls, cfg: fail_from_config(cfg)),
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.upload_artifact(request, container, file=upload)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"


@pytest.mark.asyncio
async def test_get_artifact_requires_authenticated_identity(
    tmp_path, monkeypatch
) -> None:
    container = _container(tmp_path)

    def fail_from_config(_cfg):
        raise AssertionError("ArtifactStore should not be constructed without identity")

    monkeypatch.setattr(
        artifacts_routes.ArtifactStore,
        "from_config",
        classmethod(lambda _cls, cfg: fail_from_config(cfg)),
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_routes.get_artifact("abc123.png", container)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
