"""Covers local-runtime Python namespace packages with no marker file."""

import ast
from pathlib import Path
import importlib


ROOT = Path(__file__).resolve().parents[2]
FRONTEND_PYTHON_ROOT = ROOT / "frontend/src/main/python"

REMOVED_MARKERS = [
    "frontend/src/main/python/tools/__init__.py",
    "frontend/src/main/python/tools/browser/__init__.py",
    "frontend/src/main/python/tools/computer/__init__.py",
    "frontend/src/main/python/tools/filesystem/__init__.py",
    "frontend/src/main/python/tools/system/__init__.py",
    "frontend/src/main/python/core/__init__.py",
    "frontend/src/main/python/core/platform/__init__.py",
    "frontend/src/main/python/windie_shared/__init__.py",
]

CONCRETE_MODULES = [
    "core.remote_semantic_client",
    "core.platform.window_manager",
    "tools.browser.browser_tool",
    "tools.computer.mouse_tool",
    "tools.filesystem.read_file_tool",
    "tools.system.shell_tool",
    "windie.sdk",
    "windie_shared.browser_contract",
]


def test_marker_only_local_runtime_package_files_are_removed():
    for marker in REMOVED_MARKERS:
        assert not (ROOT / marker).exists()


def test_local_runtime_namespace_packages_still_import_concrete_modules():
    for module_name in CONCRETE_MODULES:
        assert importlib.import_module(module_name).__name__ == module_name


def test_local_runtime_modules_do_not_publish_wildcard_export_lists():
    allowed_export_surfaces = {
        FRONTEND_PYTHON_ROOT / "windie/__init__.py",
    }

    for path in FRONTEND_PYTHON_ROOT.rglob("*.py"):
        if path in allowed_export_surfaces:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in tree.body:
            if isinstance(node, ast.Assign):
                assert all(
                    not (isinstance(target, ast.Name) and target.id == "__all__")
                    for target in node.targets
                ), path
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                assert node.target.id != "__all__", path
