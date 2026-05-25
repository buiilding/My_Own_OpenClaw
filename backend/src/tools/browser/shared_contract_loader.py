"""Helpers for loading the sidecar-visible browser shared contract."""

from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path
from types import ModuleType


def get_frontend_python_path() -> str:
    repo_root = Path(__file__).resolve().parents[4]
    frontend_python_dir = repo_root / "frontend" / "src" / "main" / "python"
    return str(frontend_python_dir)


def _load_windie_shared_package(package_dir: Path) -> ModuleType:
    package_name = "windie_shared"
    package_init = package_dir / "__init__.py"
    package_spec = importlib.util.spec_from_file_location(
        package_name,
        package_init,
        submodule_search_locations=[str(package_dir)],
    )
    if package_spec is None or package_spec.loader is None:
        raise ImportError(f"Unable to load {package_name} package from {package_init}")

    package = importlib.util.module_from_spec(package_spec)
    sys.modules[package_name] = package
    package_spec.loader.exec_module(package)
    return package


def load_shared_browser_contract() -> ModuleType:
    """Load windie_shared.browser_contract without mutating sys.path precedence."""
    frontend_python_dir = Path(get_frontend_python_path())
    package_dir = frontend_python_dir / "windie_shared"
    package = sys.modules.get("windie_shared")
    if package is not None:
        package_file = getattr(package, "__file__", None)
        if (
            package_file
            and Path(package_file).resolve().parent != package_dir.resolve()
        ):
            raise ImportError(
                "windie_shared is already loaded from a different location: "
                f"{package_file}"
            )
    else:
        _load_windie_shared_package(package_dir)

    return importlib.import_module("windie_shared.browser_contract")
