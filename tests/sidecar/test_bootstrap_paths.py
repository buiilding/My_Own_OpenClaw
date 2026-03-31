import os
import subprocess
import sys
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.bootstrap_paths import ensure_sidecar_import_paths


def test_ensure_sidecar_import_paths_promotes_frontend_python_and_repo_root(monkeypatch):
    entry_file = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "local_backend.py"
    )
    repo_root = str(Path(__file__).resolve().parents[2])
    frontend_python_dir = str(entry_file.parent)
    monkeypatch.setattr(sys, "path", ["site-packages", repo_root, frontend_python_dir, "other"])

    returned_frontend_python_dir, returned_repo_root = ensure_sidecar_import_paths(entry_file)

    assert returned_frontend_python_dir == frontend_python_dir
    assert returned_repo_root == repo_root
    assert sys.path[:2] == [frontend_python_dir, repo_root]
    assert sys.path.count(frontend_python_dir) == 1
    assert sys.path.count(repo_root) == 1


def test_local_backend_bootstrap_supports_backend_catalog_import_from_sidecar_cwd():
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
