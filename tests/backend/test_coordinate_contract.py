from backend.src.agent.tools.preparation.helpers.coordinate_contract import (
    CoordinateContract,
    build_contract_metadata,
    normalize_to_display_space,
)


def test_normalize_to_display_space_scales_from_screenshot_space():
    contract = CoordinateContract(
        x=1000,
        y=1000,
        coordinate_space="screenshot_px",
        source_image_size=(3840, 2160),
        target_display_size=(1920, 1080),
    )

    normalized = normalize_to_display_space(contract)

    assert normalized.x == 500
    assert normalized.y == 500
    assert normalized.status == "scaled_to_display"


def test_normalize_to_display_space_reports_missing_target():
    contract = CoordinateContract(
        x=100,
        y=200,
        coordinate_space="screenshot_px",
        source_image_size=(3840, 2160),
        target_display_size=None,
    )

    normalized = normalize_to_display_space(contract)

    assert normalized.x == 100
    assert normalized.y == 200
    assert normalized.status == "missing_target_display_size"


def test_build_contract_metadata_includes_source_target_and_normalized():
    contract = CoordinateContract(
        x=1000,
        y=500,
        coordinate_space="screenshot_px",
        source_image_size=(2000, 1000),
        target_display_size=(1000, 500),
    )
    normalized = normalize_to_display_space(contract)

    metadata = build_contract_metadata(contract, normalized)

    assert metadata["coordinate_space"] == "screenshot_px"
    assert metadata["source_coordinates"] == {"x": 1000, "y": 500}
    assert metadata["source_image_size"] == {"width": 2000, "height": 1000}
    assert metadata["target_display_size"] == {"width": 1000, "height": 500}
    assert metadata["normalized_coordinates"] == {"x": 500, "y": 250}
    assert metadata["normalized_space"] == "display_px"
    assert metadata["normalization_status"] == "scaled_to_display"
