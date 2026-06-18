"""Covers backend config behavior in the sidecar test suite."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from windie._backend_config import get_backend_http_url  # noqa: E402


def test_get_backend_http_url_defaults_to_hosted_backend(monkeypatch):
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)

    assert get_backend_http_url() == "https://api.windieos.com"


def test_get_backend_http_url_prefers_windie_specific_env(monkeypatch):
    monkeypatch.setenv("BACKEND_HTTP_URL", "http://ignored.example:8765")
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "http://primary.example:9001/")

    assert get_backend_http_url() == "http://primary.example:9001"


def test_get_backend_http_url_ignores_backend_http_url_env(monkeypatch):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "")
    monkeypatch.setenv("BACKEND_HTTP_URL", "http://ignored.example:8765/")

    assert get_backend_http_url() == "https://api.windieos.com"


def test_get_backend_http_url_keeps_non_trailing_path_slashes(monkeypatch):
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    monkeypatch.setenv(
        "WINDIE_BACKEND_HTTP_URL",
        "http://localhost:9001/api/v1/",
    )

    assert get_backend_http_url() == "http://localhost:9001/api/v1"


def test_get_backend_http_url_strips_multiple_trailing_slashes(monkeypatch):
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "http://localhost:9001////")

    assert get_backend_http_url() == "http://localhost:9001"
