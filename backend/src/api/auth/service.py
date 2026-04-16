"""No-login install registration and bearer-token authentication."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from backend.src.api.auth.context import AuthenticatedInstallIdentity
from backend.src.core.config import AppConfig


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _next_user_id() -> str:
    return f"user_{uuid4().hex}"


def _next_install_id() -> str:
    return f"install_{uuid4().hex}"


def _next_install_token() -> str:
    return f"wnd_install_{secrets.token_urlsafe(32)}"


@dataclass(frozen=True)
class RegisteredInstall:
    user_id: str
    install_id: str
    install_token: str


class InstallAuthService:
    """Persist install records and authenticate bearer tokens."""

    def __init__(self, db_path: str) -> None:
        self._db_path = Path(db_path)
        self._lock = threading.Lock()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @classmethod
    def from_config(cls, config: AppConfig) -> "InstallAuthService":
        return cls(config.install_auth_db_path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS installs (
                    install_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    operating_system TEXT
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_installs_user_id ON installs(user_id)"
            )
            connection.commit()

    def register_install(
        self,
        *,
        operating_system: Optional[str] = None,
    ) -> RegisteredInstall:
        user_id = _next_user_id()
        install_id = _next_install_id()
        install_token = _next_install_token()
        now_iso = _utc_now_iso()
        normalized_operating_system = (
            operating_system.strip()
            if isinstance(operating_system, str) and operating_system.strip()
            else None
        )
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO installs (
                    install_id,
                    user_id,
                    token_hash,
                    created_at,
                    last_seen_at,
                    operating_system
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    install_id,
                    user_id,
                    _hash_token(install_token),
                    now_iso,
                    now_iso,
                    normalized_operating_system,
                ),
            )
            connection.commit()
        return RegisteredInstall(
            user_id=user_id,
            install_id=install_id,
            install_token=install_token,
        )

    def authenticate_token(
        self,
        token: str,
    ) -> Optional[AuthenticatedInstallIdentity]:
        normalized_token = token.strip() if isinstance(token, str) else ""
        if not normalized_token:
            return None
        token_hash = _hash_token(normalized_token)
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT install_id, user_id
                FROM installs
                WHERE token_hash = ?
                """,
                (token_hash,),
            ).fetchone()
            if row is None:
                return None
            connection.execute(
                """
                UPDATE installs
                SET last_seen_at = ?
                WHERE install_id = ?
                """,
                (_utc_now_iso(), row["install_id"]),
            )
            connection.commit()
        return AuthenticatedInstallIdentity(
            user_id=str(row["user_id"]),
            install_id=str(row["install_id"]),
        )


def extract_bearer_token(authorization_header: Optional[str]) -> Optional[str]:
    if not isinstance(authorization_header, str):
        return None
    scheme, _, credentials = authorization_header.partition(" ")
    if scheme.lower().strip() != "bearer":
        return None
    normalized_credentials = credentials.strip()
    return normalized_credentials or None

