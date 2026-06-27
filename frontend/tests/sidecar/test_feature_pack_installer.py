"""Covers local-runtime feature pack installer behavior."""

from pathlib import Path

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import core.feature_pack_installer as feature_pack_installer  # noqa: E402
from core.feature_pack_installer import (
    _FEATURE_PACK_MODULE_MARKERS,
    _FEATURE_PACK_REQUIREMENTS,
    _resolve_requirements_file,
    get_feature_pack_site_packages_dir,
)  # noqa: E402


def test_browser_feature_pack_markers_include_markdownify() -> None:
    assert "markdownify" in _FEATURE_PACK_MODULE_MARKERS["browser"]


def test_browser_feature_pack_markers_require_browser_use_engine() -> None:
    assert _FEATURE_PACK_MODULE_MARKERS["browser"] == (
        "browser_use",
        "playwright",
        "markdownify",
    )


def test_browser_feature_pack_uses_runtime_requirements_file() -> None:
    assert _FEATURE_PACK_REQUIREMENTS["browser"] == "requirements.runtime.txt"


def test_feature_pack_site_packages_dir_uses_local_runtime_root(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(
        feature_pack_installer, "_resolve_user_data_root", lambda: tmp_path
    )

    assert get_feature_pack_site_packages_dir() == (
        tmp_path / "local_runtime_feature_packs" / "site-packages"
    )


def test_feature_pack_installer_source_uses_local_runtime_terms() -> None:
    source = Path(feature_pack_installer.__file__).read_text(encoding="utf-8")
    retired_feature_pack_dir = "sidecar" + "_feature_packs"
    retired_root_helper = "_resolve_" + "sidecar_python_root"

    assert "optional local-runtime capabilities" in source
    assert "local_runtime_feature_packs" in source
    assert "_resolve_local_runtime_python_root" in source
    assert retired_feature_pack_dir not in source
    assert retired_root_helper not in source


def test_resolve_requirements_file_uses_local_runtime_python_root() -> None:
    requirements_path = _resolve_requirements_file("browser")

    assert requirements_path.name == "requirements.runtime.txt"
    assert requirements_path.parent == Path(feature_pack_installer.__file__).parents[
        1
    ]
