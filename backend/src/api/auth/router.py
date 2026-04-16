"""Install registration routes for no-login hosted auth."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from backend.src.api.auth.service import InstallAuthService

router = APIRouter(prefix="/api/install", tags=["install-auth"])


class RegisterInstallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operating_system: Optional[str] = None


class RegisterInstallResponse(BaseModel):
    success: bool = True
    user_id: str
    install_id: str
    install_token: str


@router.post("/register", response_model=RegisterInstallResponse)
async def register_install(
    http_request: Request,
    request: RegisterInstallRequest,
) -> RegisterInstallResponse:
    """Issue a durable install token and server-owned user identity."""
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
