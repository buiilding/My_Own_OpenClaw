import os
import subprocess
import sys
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.bootstrap_paths import ensure_sidecar_python_path


def test_ensure_sidecar_python_path_promotes_frontend_python_dir(monkeypatch):
    entry_file = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "local_backend.py"
    )
    frontend_python_dir = str(entry_file.parent)
    monkeypatch.setattr(sys, "path", ["site-packages", frontend_python_dir, "other"])

    returned_frontend_python_dir = ensure_sidecar_python_path(entry_file)

    assert returned_frontend_python_dir == frontend_python_dir
    assert sys.path[0] == frontend_python_dir
    assert sys.path.count(frontend_python_dir) == 1


def test_local_backend_bootstrap_supports_client_local_tool_registry_from_sidecar_cwd():
    repo_root = Path(__file__).resolve().parents[2]
    sidecar_dir = repo_root / "frontend" / "src" / "main" / "python"
    script = """
import importlib.util
import pathlib

module_path = pathlib.Path("local_backend.py").resolve()
spec = importlib.util.spec_from_file_location("sidecar_bootstrap_smoke", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
backend = module.LocalBackend()
assert "read_file" in backend.tool_registry.tools
print("ok")
"""

    env = os.environ.copy()
    env["PYTHONPATH"] = ""

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=sidecar_dir,
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )

    assert result.returncode == 0, (
        f"stdout:\n{result.stdout}\n\nstderr:\n{result.stderr}"
    )
    assert result.stdout.strip() == "ok"
