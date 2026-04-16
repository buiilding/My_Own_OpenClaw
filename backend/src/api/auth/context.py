"""Per-request authenticated install identity context."""

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class AuthenticatedInstallIdentity:
    """Server-authenticated install identity bound to one hosted user."""

    user_id: str
    install_id: str


_current_identity: ContextVar[Optional[AuthenticatedInstallIdentity]] = ContextVar(
    "current_authenticated_install_identity",
    default=None,
)


def set_current_authenticated_install_identity(
    identity: Optional[AuthenticatedInstallIdentity],
) -> Token[Optional[AuthenticatedInstallIdentity]]:
    return _current_identity.set(identity)


def reset_current_authenticated_install_identity(
    token: Token[Optional[AuthenticatedInstallIdentity]],
) -> None:
    _current_identity.reset(token)


def get_current_authenticated_install_identity() -> Optional[AuthenticatedInstallIdentity]:
    return _current_identity.get()

