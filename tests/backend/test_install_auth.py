from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from backend.src.api.auth.context import get_current_authenticated_install_identity
from backend.src.api.auth.http_middleware import install_auth_http_middleware
from backend.src.api.auth.router import router as install_auth_router
from backend.src.api.auth.service import InstallAuthService


@dataclass
class _RegisteredInstallStub:
    user_id: str = "user_test"
    install_id: str = "install_test"
    install_token: str = "wnd_install_test"


class _InstallAuthServiceStub(InstallAuthService):
    def __init__(self) -> None:
        self.calls: list[dict[str, str | None]] = []

    def register_install(self, *, operating_system: str | None = None):
        self.calls.append({"operating_system": operating_system})
        return _RegisteredInstallStub()


class _FailingInstallAuthServiceStub(InstallAuthService):
    def __init__(self) -> None:
        pass

    def register_install(self, *, operating_system: str | None = None):  # noqa: ARG002
        raise RuntimeError("registration failed")


def _build_app(
    *,
    install_auth_enabled: bool,
    db_path: str,
    install_registration_enabled: bool = True,
    install_registration_secret: str | None = None,
) -> FastAPI:
    app = FastAPI()
    app.state.container = SimpleNamespace(
        config=SimpleNamespace(
            install_auth_enabled=install_auth_enabled,
            install_registration_enabled=install_registration_enabled,
            install_registration_secret=install_registration_secret,
        ),
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


def _build_register_only_app(
    install_auth_service: object | None = None,
    *,
    install_registration_enabled: bool = True,
    install_registration_secret: str | None = None,
) -> FastAPI:
    app = FastAPI()
    app.state.container = SimpleNamespace(
        config=SimpleNamespace(
            install_registration_enabled=install_registration_enabled,
            install_registration_secret=install_registration_secret,
        ),
    )
    if install_auth_service is not None:
        app.state.install_auth_service = install_auth_service
    app.include_router(install_auth_router)
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

        identity_response = client.get(
            "/api/install/me",
            headers={
                "Authorization": f"Bearer {register_payload['install_token']}",
            },
        )

        assert identity_response.status_code == 200
        assert identity_response.json() == {
            "success": True,
            "user_id": register_payload["user_id"],
            "install_id": register_payload["install_id"],
        }


def test_register_install_returns_503_when_service_is_unavailable() -> None:
    app = _build_register_only_app()

    with TestClient(app) as client:
        response = client.post(
            "/api/install/register",
            json={"operating_system": "Linux"},
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "Install auth service not available"}


def test_register_install_returns_503_when_service_is_miswired() -> None:
    app = _build_register_only_app(object())

    with TestClient(app) as client:
        response = client.post(
            "/api/install/register",
            json={"operating_system": "Linux"},
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "Install auth service not available"}


def test_register_install_rejects_extra_request_fields() -> None:
    service = _InstallAuthServiceStub()
    app = _build_register_only_app(service)

    with TestClient(app) as client:
        response = client.post(
            "/api/install/register",
            json={
                "operating_system": "macOS",
                "user_id": "client-chosen-user",
            },
        )

    assert response.status_code == 422
    assert service.calls == []


def test_register_install_rejects_when_registration_is_disabled() -> None:
    service = _InstallAuthServiceStub()
    app = _build_register_only_app(service, install_registration_enabled=False)

    with TestClient(app) as client:
        response = client.post(
            "/api/install/register",
            json={"operating_system": "Windows"},
        )

    assert response.status_code == 403
    assert response.json() == {"detail": "Install registration is disabled"}
    assert service.calls == []


def test_register_install_requires_configured_bootstrap_secret() -> None:
    service = _InstallAuthServiceStub()
    app = _build_register_only_app(
        service,
        install_registration_secret="expected-secret",
    )

    with TestClient(app) as client:
        missing_response = client.post(
            "/api/install/register",
            json={"operating_system": "Windows"},
        )
        wrong_response = client.post(
            "/api/install/register",
            headers={"X-Windie-Install-Registration-Secret": "wrong-secret"},
            json={"operating_system": "Windows"},
        )
        accepted_response = client.post(
            "/api/install/register",
            headers={"X-Windie-Install-Registration-Secret": "expected-secret"},
            json={"operating_system": "Windows"},
        )

    assert missing_response.status_code == 403
    assert wrong_response.status_code == 403
    assert accepted_response.status_code == 200
    assert service.calls == [{"operating_system": "Windows"}]


def test_register_install_uses_service_response_shape() -> None:
    service = _InstallAuthServiceStub()
    app = _build_register_only_app(service)

    with TestClient(app) as client:
        response = client.post(
            "/api/install/register",
            json={"operating_system": "Windows"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "user_id": "user_test",
        "install_id": "install_test",
        "install_token": "wnd_install_test",
    }
    assert service.calls == [{"operating_system": "Windows"}]


def test_register_install_service_failure_is_not_mapped_to_success() -> None:
    app = _build_register_only_app(_FailingInstallAuthServiceStub())

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post(
            "/api/install/register",
            json={"operating_system": "Windows"},
        )

    assert response.status_code == 500
    assert "registration failed" not in response.text


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

        missing_identity_response = client.get("/api/install/me")
        assert missing_identity_response.status_code == 401
        assert missing_identity_response.json() == {
            "detail": "Missing install bearer token",
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
