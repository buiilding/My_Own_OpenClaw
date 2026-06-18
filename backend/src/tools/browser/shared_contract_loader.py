"""Helpers for loading the backend/local-runtime browser shared contract."""

from __future__ import annotations

import importlib
import sys
from importlib.machinery import ModuleSpec
from pathlib import Path
from types import ModuleType


def _load_shared_contract_package(package_dir: Path) -> ModuleType:
    package_name = "windie_shared"
    if not package_dir.is_dir():
        raise ImportError(f"Unable to load {package_name} package from {package_dir}")

    package = ModuleType(package_name)
    package.__path__ = [str(package_dir)]
    package.__package__ = package_name
    package.__spec__ = ModuleSpec(package_name, loader=None, is_package=True)
    package.__spec__.submodule_search_locations = [str(package_dir)]
    sys.modules[package_name] = package
    return package


def _package_root(package: ModuleType) -> Path | None:
    package_file = getattr(package, "__file__", None)
    if package_file:
        return Path(package_file).resolve().parent

    package_paths = getattr(package, "__path__", None)
    if package_paths:
        return Path(next(iter(package_paths))).resolve()

    return None


def load_shared_browser_contract() -> ModuleType:
    """Load windie_shared.browser_contract without mutating sys.path precedence."""
    repo_root = Path(__file__).resolve().parents[4]
    package_dir = repo_root / "frontend" / "src" / "main" / "python" / "windie_shared"
    package = sys.modules.get("windie_shared")
    if package is not None:
        package_root = _package_root(package)
        if package_root and package_root != package_dir.resolve():
            raise ImportError(
                "windie_shared is already loaded from a different location: "
                f"{package_root}"
            )
    else:
        _load_shared_contract_package(package_dir)

    return importlib.import_module("windie_shared.browser_contract")
