from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.backend_config import get_backend_http_url, get_backend_http_urls  # noqa: E402


def test_get_backend_http_url_defaults_to_hosted_backend(monkeypatch):
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)

    assert get_backend_http_url() == "https://api.windieos.com"


def test_get_backend_http_url_prefers_windie_specific_env(monkeypatch):
    monkeypatch.setenv("BACKEND_HTTP_URL", "http://fallback.example:8765")
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "http://primary.example:9001/")

    assert get_backend_http_url() == "http://primary.example:9001"


def test_get_backend_http_url_uses_fallback_when_windie_env_empty(monkeypatch):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "")
    monkeypatch.setenv("BACKEND_HTTP_URL", "http://fallback.example:8765/")

    assert get_backend_http_url() == "http://fallback.example:8765"


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


def test_get_backend_http_urls_prefers_windie_env_then_backend_env_then_hosted_default(monkeypatch):
    monkeypatch.setenv("WINDIE_BACKEND_HTTP_URL", "https://api.windieos.com/")
    monkeypatch.setenv("BACKEND_HTTP_URL", "https://backup.windie.example/")

    assert get_backend_http_urls() == [
        "https://api.windieos.com",
        "https://backup.windie.example",
    ]
