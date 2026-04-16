"""HTTP middleware for install-token authentication."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.responses import JSONResponse, Response

from backend.src.api.auth.context import (
    reset_current_authenticated_install_identity,
    set_current_authenticated_install_identity,
)
from backend.src.api.auth.service import InstallAuthService, extract_bearer_token

logger = logging.getLogger(__name__)

_UNAUTHENTICATED_PATHS = frozenset(
    {
        "/api/install/register",
    }
)


async def install_auth_http_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Authenticate hosted REST requests with install bearer tokens."""
    path = request.url.path
    if not path.startswith("/api/") or path in _UNAUTHENTICATED_PATHS:
        return await call_next(request)

    config = getattr(getattr(request.app, "state", None), "container", None)
    install_auth_enabled = bool(
        getattr(getattr(config, "config", None), "install_auth_enabled", True)
    )
    if not install_auth_enabled:
        return await call_next(request)

    install_auth_service = getattr(request.app.state, "install_auth_service", None)
    if not isinstance(install_auth_service, InstallAuthService):
        logger.error("Install auth service missing for authenticated request path %s", path)
        return JSONResponse(
            status_code=503,
            content={"detail": "Install auth service not available"},
        )

    token = extract_bearer_token(request.headers.get("authorization"))
    if token is None:
        return JSONResponse(
            status_code=401,
            content={"detail": "Missing install bearer token"},
        )

    identity = install_auth_service.authenticate_token(token)
    if identity is None:
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid install bearer token"},
        )

    token_ctx = set_current_authenticated_install_identity(identity)
    request.state.install_identity = identity
    try:
        return await call_next(request)
    finally:
        reset_current_authenticated_install_identity(token_ctx)

