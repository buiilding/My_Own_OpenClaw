import sys
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path


def ensure_local_browser_use_path() -> None:
    """Ensure tests import the repo-local browser_use package, not site-packages."""
    ensure_frontend_python_path()
    browser_use_python_root = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "browser"
    )
    browser_use_python_root_str = str(browser_use_python_root)
    if browser_use_python_root_str not in sys.path:
        sys.path.insert(0, browser_use_python_root_str)
