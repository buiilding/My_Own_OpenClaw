import sys
from pathlib import Path


frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from core.backend_config import get_backend_http_url  # noqa: E402


def test_get_backend_http_url_defaults_to_localhost(monkeypatch):
    monkeypatch.delenv("WINDIE_BACKEND_HTTP_URL", raising=False)
    monkeypatch.delenv("BACKEND_HTTP_URL", raising=False)

    assert get_backend_http_url() == "http://127.0.0.1:8765"


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
