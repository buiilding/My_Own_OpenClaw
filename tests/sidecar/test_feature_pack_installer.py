from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core.feature_pack_installer import _FEATURE_PACK_MODULE_MARKERS  # noqa: E402


def test_browser_feature_pack_markers_include_markdownify() -> None:
    assert "markdownify" in _FEATURE_PACK_MODULE_MARKERS["browser"]
