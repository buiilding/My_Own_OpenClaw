"""Covers backend config behavior in the sidecar test suite."""

from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from windie._backend_config import get_backend_http_url  # noqa: E402


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_get_backend_http_url_requires_configured_backend(monkeypatch):
    monkeypatch.delenv("AGENT_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)

    try:
        get_backend_http_url()
    except RuntimeError as exc:
        assert (
            str(exc)
            == (
                "Agent SDK backend URL is required. Pass backend_url or set "
                "AGENT_BACKEND_HTTP_URL (legacy WINDIE_BACKEND_HTTP_URL is also supported)."
            )
        )
    else:
        raise AssertionError("expected missing backend URL to fail")


def test_get_backend_http_url_prefers_agent_env(monkeypatch):
    monkeypatch.setenv("BACKEND_HTTP_URL", "http://ignored.example:8765")
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "http://legacy.example:9001/")
    monkeypatch.setenv("AGENT_BACKEND_HTTP_URL", "http://primary.example:9001/")

    assert get_backend_http_url() == "http://primary.example:9001"


def test_get_backend_http_url_supports_legacy_windie_env(monkeypatch):
    monkeypatch.delenv("AGENT_BACKEND_HTTP_URL", raising=False)
    monkeypatch.setenv("BACKEND_HTTP_URL", "http://ignored.example:8765")
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "http://legacy.example:9001/")

    assert get_backend_http_url() == "http://legacy.example:9001"


def test_get_backend_http_url_ignores_backend_http_url_env(monkeypatch):
    monkeypatch.setenv("AGENT_BACKEND_HTTP_URL", "")
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "")
    monkeypatch.setenv("BACKEND_HTTP_URL", "http://ignored.example:8765/")

    try:
        get_backend_http_url()
    except RuntimeError as exc:
        assert (
            str(exc)
            == (
                "Agent SDK backend URL is required. Pass backend_url or set "
                "AGENT_BACKEND_HTTP_URL (legacy WINDIE_BACKEND_HTTP_URL is also supported)."
            )
        )
    else:
        raise AssertionError("expected empty backend URL to fail")


def test_get_backend_http_url_keeps_non_trailing_path_slashes(monkeypatch):
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.setenv(
        "AGENT_BACKEND_HTTP_URL",
        "http://localhost:9001/api/v1/",
    )

    assert get_backend_http_url() == "http://localhost:9001/api/v1"


def test_get_backend_http_url_strips_multiple_trailing_slashes(monkeypatch):
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.setenv("AGENT_BACKEND_HTTP_URL", "http://localhost:9001////")

    assert get_backend_http_url() == "http://localhost:9001"


def test_python_sdk_backend_config_source_uses_sdk_local_runtime_wording():
    source = (
        REPO_ROOT / "frontend/src/main/python/windie/_backend_config.py"
    ).read_text(encoding="utf-8")

    assert "Python SDK local-runtime clients" in source
    assert "Python SDK hosted clients" in source
    assert "sidecar memory clients" not in source
    assert "Python sidecar" not in source


def test_sidecar_architecture_docs_describe_required_injected_backend_url():
    docs = "\n".join(
        (REPO_ROOT / relative_path).read_text(encoding="utf-8")
        for relative_path in [
            "docs/architecture/python_sidecar.md",
            (
                "docs/frontend/sidecar/core/"
                "backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md"
            ),
        ]
    )

    assert "missing sidecar endpoint config raises" in docs
    assert "then default `https://api.windieos.com`" not in docs
    assert "hosted default URL would duplicate endpoint ownership" in docs
