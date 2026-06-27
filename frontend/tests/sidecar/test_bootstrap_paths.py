"""Covers local-runtime Python bootstrap path behavior."""

import os
import subprocess
import sys
from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.bootstrap_paths import ensure_local_runtime_python_path


def test_ensure_local_runtime_python_path_promotes_runtime_python_dir(monkeypatch):
    entry_file = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "local_backend.py"
    )
    local_runtime_python_dir = str(entry_file.parent)
    monkeypatch.setattr(
        sys, "path", ["site-packages", local_runtime_python_dir, "other"]
    )

    returned_local_runtime_python_dir = ensure_local_runtime_python_path(entry_file)

    assert returned_local_runtime_python_dir == local_runtime_python_dir
    assert sys.path[0] == local_runtime_python_dir
    assert sys.path.count(local_runtime_python_dir) == 1


def test_bootstrap_paths_source_uses_local_runtime_terms():
    source = Path(__file__).read_text(encoding="utf-8")
    helper_source = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "core"
        / "bootstrap_paths.py"
    ).read_text(encoding="utf-8")
    retired_helper_name = "ensure_" + "sidecar_python_path"
    retired_dir_name = "sidecar" + "_python_dir"
    retired_docstring = (
        "Covers bootstrap paths behavior in the " + "sidecar test suite."
    )
    retired_smoke_test = (
        "test_"
        + "local_backend_bootstrap_supports_client_local_tool_registry_from_runtime_cwd"
    )

    assert "Covers local-runtime Python bootstrap path behavior." in source
    assert (
        "test_local_runtime_bootstrap_supports_client_local_tool_registry_from_runtime_cwd"
        in source
    )
    assert retired_helper_name not in source
    assert retired_helper_name not in helper_source
    assert retired_dir_name not in source
    assert retired_dir_name not in helper_source
    assert retired_docstring not in source
    assert retired_smoke_test not in source


def test_local_runtime_bootstrap_supports_client_local_tool_registry_from_runtime_cwd():
    repo_root = Path(__file__).resolve().parents[2]
    local_runtime_dir = repo_root / "frontend" / "src" / "main" / "python"
    script = """
import importlib.util
import pathlib

module_path = pathlib.Path("local_backend.py").resolve()
spec = importlib.util.spec_from_file_location(
    "local_runtime_bootstrap_smoke", module_path
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
local_runtime = module.LocalRuntimeService()
assert "read_file" in local_runtime.tool_registry.tools
print("ok")
"""

    env = os.environ.copy()
    env["PYTHONPATH"] = ""

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=local_runtime_dir,
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )

    assert result.returncode == 0, (
        f"stdout:\n{result.stdout}\n\nstderr:\n{result.stderr}"
    )
    assert result.stdout.strip() == "ok"
