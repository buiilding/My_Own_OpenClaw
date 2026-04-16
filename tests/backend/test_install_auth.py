from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from backend.src.api.auth.context import get_current_authenticated_install_identity
from backend.src.api.auth.http_middleware import install_auth_http_middleware
from backend.src.api.auth.router import router as install_auth_router
from backend.src.api.auth.service import InstallAuthService


def _build_app(*, install_auth_enabled: bool, db_path: str) -> FastAPI:
    app = FastAPI()
    app.state.container = SimpleNamespace(
        config=SimpleNamespace(install_auth_enabled=install_auth_enabled),
    )
    app.state.install_auth_service = InstallAuthService(db_path)
    app.middleware("http")(install_auth_http_middleware)
    app.include_router(install_auth_router)

    @app.get("/api/protected")
    async def protected(request: Request) -> dict[str, str | None]:
        identity = get_current_authenticated_install_identity()
        request_identity = getattr(request.state, "install_identity", None)
        return {
            "user_id": identity.user_id if identity is not None else None,
            "install_id": identity.install_id if identity is not None else None,
            "request_user_id": (
                request_identity.user_id if request_identity is not None else None
            ),
            "request_install_id": (
                request_identity.install_id if request_identity is not None else None
            ),
        }

    return app


def test_register_install_returns_token_and_protected_route_uses_authenticated_identity(
    tmp_path,
) -> None:
    app = _build_app(
        install_auth_enabled=True,
        db_path=str(tmp_path / "install-auth.sqlite3"),
    )

    with TestClient(app) as client:
        register_response = client.post(
            "/api/install/register",
            json={"operating_system": "Windows"},
        )

        assert register_response.status_code == 200
        register_payload = register_response.json()
        assert register_payload["success"] is True
        assert register_payload["user_id"].startswith("user_")
        assert register_payload["install_id"].startswith("install_")
        assert register_payload["install_token"].startswith("wnd_install_")

        protected_response = client.get(
            "/api/protected",
            headers={
                "Authorization": f"Bearer {register_payload['install_token']}",
            },
        )

        assert protected_response.status_code == 200
        assert protected_response.json() == {
            "user_id": register_payload["user_id"],
            "install_id": register_payload["install_id"],
            "request_user_id": register_payload["user_id"],
            "request_install_id": register_payload["install_id"],
        }


def test_protected_route_rejects_missing_or_invalid_install_token(tmp_path) -> None:
    app = _build_app(
        install_auth_enabled=True,
        db_path=str(tmp_path / "install-auth.sqlite3"),
    )

    with TestClient(app) as client:
        missing_token_response = client.get("/api/protected")
        assert missing_token_response.status_code == 401
        assert missing_token_response.json() == {
            "detail": "Missing install bearer token",
        }

        invalid_token_response = client.get(
            "/api/protected",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert invalid_token_response.status_code == 401
        assert invalid_token_response.json() == {
            "detail": "Invalid install bearer token",
        }


def test_protected_route_bypasses_install_auth_when_disabled(tmp_path) -> None:
    app = _build_app(
        install_auth_enabled=False,
        db_path=str(tmp_path / "install-auth.sqlite3"),
    )

    with TestClient(app) as client:
        response = client.get("/api/protected")

        assert response.status_code == 200
        assert response.json() == {
            "user_id": None,
            "install_id": None,
            "request_user_id": None,
            "request_install_id": None,
        }
