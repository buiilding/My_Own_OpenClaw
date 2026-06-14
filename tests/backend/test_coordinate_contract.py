"""Covers coordinate contract behavior in the backend test suite."""

from backend.src.agent.tools.preparation.helpers.coordinate_contract import (
    CoordinateContract,
    build_contract_metadata,
    build_identity_capture_meta,
    normalize_to_display_space,
)


def test_normalize_to_display_space_scales_with_capture_crop_ratio():
    contract = CoordinateContract(
        x=1000,
        y=1000,
        coordinate_space="screenshot_px",
        screenshot_id="shot-1",
        capture_meta={
            "screenshot_id": "shot-1",
            "source_w": 3840,
            "source_h": 2160,
            "crop_x": 0,
            "crop_y": 0,
            "crop_w": 1920,
            "crop_h": 1080,
            "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    normalized = normalize_to_display_space(contract)

    assert normalized.x == 500
    assert normalized.y == 500
    assert normalized.status == "scaled_to_desktop"


def test_normalize_to_display_space_reports_missing_capture_meta():
    contract = CoordinateContract(
        x=100,
        y=200,
        coordinate_space="screenshot_px",
        screenshot_id="shot-2",
        capture_meta=None,
    )

    normalized = normalize_to_display_space(contract)

    assert normalized.x == 100
    assert normalized.y == 200
    assert normalized.status == "missing_capture_meta"


def test_normalize_to_display_space_clamps_out_of_bounds_source_coordinates():
    contract = CoordinateContract(
        x=5000,
        y=-10,
        coordinate_space="screenshot_px",
        screenshot_id="shot-3",
        capture_meta={
            "screenshot_id": "shot-3",
            "source_w": 100,
            "source_h": 50,
            "crop_x": 10,
            "crop_y": 20,
            "crop_w": 200,
            "crop_h": 100,
            "desktop_virtual_bounds": {"x": 10, "y": 20, "width": 200, "height": 100},
            "monitor_id": None,
            "timestamp": 1,
        },
    )

    normalized = normalize_to_display_space(contract)

    assert normalized.x == 208
    assert normalized.y == 20
    assert normalized.clamped_source_x == 99
    assert normalized.clamped_source_y == 0
    assert normalized.status == "scaled_to_desktop_clamped"


def test_build_contract_metadata_includes_capture_transform_details():
    contract = CoordinateContract(
        x=1000,
        y=500,
        coordinate_space="screenshot_px",
        screenshot_id="shot-4",
        capture_meta={
            "screenshot_id": "shot-4",
            "source_w": 2000,
            "source_h": 1000,
            "crop_x": 30,
            "crop_y": 40,
            "crop_w": 1000,
            "crop_h": 500,
            "desktop_virtual_bounds": {"x": 30, "y": 40, "width": 1000, "height": 500},
            "monitor_id": "display-1",
            "timestamp": 123,
        },
    )
    normalized = normalize_to_display_space(contract)

    metadata = build_contract_metadata(contract, normalized)

    assert metadata["coordinate_space"] == "screenshot_px"
    assert metadata["screenshot_id"] == "shot-4"
    assert metadata["source_coordinates"] == {"x": 1000, "y": 500}
    assert metadata["source_image_size"] == {"width": 2000, "height": 1000}
    assert metadata["capture_crop"] == {"x": 30, "y": 40, "width": 1000, "height": 500}
    assert metadata["normalized_coordinates"] == {"x": 530, "y": 290}
    assert metadata["normalized_space"] == "desktop_px"
    assert metadata["normalization_status"] == "scaled_to_desktop"


def test_build_identity_capture_meta_uses_source_dimensions_for_crop_defaults():
    capture_meta = build_identity_capture_meta(
        screenshot_id="shot-identity",
        source_w=1920,
        source_h=1080,
        timestamp_ms=777,
    )

    assert capture_meta == {
        "screenshot_id": "shot-identity",
        "source_w": 1920,
        "source_h": 1080,
        "crop_x": 0,
        "crop_y": 0,
        "crop_w": 1920,
        "crop_h": 1080,
        "desktop_virtual_bounds": {"x": 0, "y": 0, "width": 1920, "height": 1080},
        "monitor_id": None,
        "timestamp": 777,
    }
