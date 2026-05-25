"""Install registration routes for no-login hosted auth."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from backend.src.api.auth.service import InstallAuthService

router = APIRouter(prefix="/api/install", tags=["install-auth"])

_REGISTRATION_SECRET_HEADER = "X-Windie-Install-Registration-Secret"


class RegisterInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operating_system: Optional[str] = None


class RegisterInstallResponse(BaseModel):
    success: bool = True
    user_id: str
    install_id: str
    install_token: str


def _install_registration_policy(http_request: Request) -> tuple[bool, Optional[str]]:
    container = getattr(http_request.app.state, "container", None)
    config = getattr(container, "config", None)
    enabled = bool(getattr(config, "install_registration_enabled", True))
    secret = getattr(config, "install_registration_secret", None)
    if isinstance(secret, str):
        secret = secret.strip() or None
    return enabled, secret


@router.post("/register", response_model=RegisterInstallResponse)
async def register_install(
    http_request: Request,
    request: RegisterInstallRequest,
    registration_secret: Optional[str] = Header(
        default=None,
        alias=_REGISTRATION_SECRET_HEADER,
    ),
) -> RegisterInstallResponse:
    """Issue a durable install token and server-owned user identity."""
    registration_enabled, required_secret = _install_registration_policy(http_request)
    if not registration_enabled:
        raise HTTPException(status_code=403, detail="Install registration is disabled")
    if required_secret is not None and not secrets.compare_digest(
        registration_secret or "",
        required_secret,
    ):
        raise HTTPException(
            status_code=403,
            detail="Install registration secret is required",
        )

    install_auth_service = getattr(http_request.app.state, "install_auth_service", None)
    if install_auth_service is None:
        raise HTTPException(status_code=503, detail="Install auth service not available")
    registered = install_auth_service.register_install(
        operating_system=request.operating_system,
    )
    return RegisterInstallResponse(
        user_id=registered.user_id,
        install_id=registered.install_id,
        install_token=registered.install_token,
    )
