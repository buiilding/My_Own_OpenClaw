"""Covers sidecar namespace packages that intentionally have no marker file."""

from pathlib import Path
import importlib


ROOT = Path(__file__).resolve().parents[2]

REMOVED_MARKERS = [
    "frontend/src/main/python/tools/__init__.py",
    "frontend/src/main/python/tools/browser/__init__.py",
    "frontend/src/main/python/tools/computer/__init__.py",
    "frontend/src/main/python/tools/filesystem/__init__.py",
    "frontend/src/main/python/tools/system/__init__.py",
    "frontend/src/main/python/windie_shared/__init__.py",
]

CONCRETE_MODULES = [
    "tools.browser.browser_tool",
    "tools.computer.mouse_tool",
    "tools.filesystem.read_file_tool",
    "tools.system.shell_tool",
    "windie_shared.browser_contract",
]


def test_marker_only_sidecar_package_files_are_removed():
    for marker in REMOVED_MARKERS:
        assert not (ROOT / marker).exists()


def test_sidecar_namespace_packages_still_import_concrete_modules():
    for module_name in CONCRETE_MODULES:
        assert importlib.import_module(module_name).__name__ == module_name
