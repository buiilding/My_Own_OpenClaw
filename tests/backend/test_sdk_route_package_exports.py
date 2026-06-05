"""Smoke tests for SDK route package exports."""

from backend.src.api.routes import sdk


def test_sdk_route_package_exports_router_only() -> None:
    assert sdk.__all__ == ["router"]
    assert hasattr(sdk, "router")
    assert not hasattr(sdk, "sdk_ocr_run")
    assert not hasattr(sdk, "OcrRunRequest")
