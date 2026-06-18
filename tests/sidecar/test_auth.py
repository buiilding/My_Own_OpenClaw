"""Covers Python SDK install-auth state helpers."""

import json
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from windie._auth import get_install_auth_state_path, get_install_bearer_token  # noqa: E402


def test_install_auth_state_path_prefers_agent_env(monkeypatch, tmp_path):
    legacy_path = tmp_path / "legacy-auth.json"
    agent_path = tmp_path / "agent-auth.json"
    monkeypatch.setenv("BACKEND_AUTH_STATE_PATH", str(tmp_path / "ignored-auth.json"))
    monkeypatch.setenv("WINDIE_BACKEND_AUTH_STATE_PATH", str(legacy_path))
    monkeypatch.setenv("AGENT_BACKEND_AUTH_STATE_PATH", str(agent_path))

    assert get_install_auth_state_path() == agent_path


def test_install_bearer_token_supports_legacy_windie_auth_env(monkeypatch, tmp_path):
    monkeypatch.delenv("AGENT_BACKEND_AUTH_STATE_PATH", raising=False)
    auth_path = tmp_path / "auth.json"
    auth_path.write_text(json.dumps({"installToken": " token-123 "}), encoding="utf-8")
    monkeypatch.setenv("WINDIE_BACKEND_AUTH_STATE_PATH", str(auth_path))

    assert get_install_bearer_token() == "token-123"


def test_auth_helper_source_uses_sdk_hosted_wording():
    source = Path(get_install_auth_state_path.__code__.co_filename).read_text(
        encoding="utf-8"
    )

    assert "Python SDK hosted clients" in source
    assert "sidecar backend clients" not in source
