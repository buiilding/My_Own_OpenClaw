import pytest

from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
    OcrCoordinateResolver,
)


def _ocr_item(text: str, x: int, y: int, width: int = 100, height: int = 20) -> dict:
    return {
        "text": text,
        "bbox": {
            "x": x,
            "y": y,
            "width": width,
            "height": height,
        },
    }


def test_resolve_returns_center_for_single_exact_match():
    ocr_results = [
        _ocr_item("Checkout", 10, 10),
        _ocr_item("Add to cart", 100, 200),
        _ocr_item("Continue", 400, 250),
    ]

    x, y = OcrCoordinateResolver.resolve("Add to cart", ocr_results)

    assert (x, y) == (150, 210)


def test_resolve_raises_actionable_error_for_multiple_fuzzy_matches():
    ocr_results = [
        _ocr_item("Add to cart", 100, 200),
        _ocr_item("Add to carts", 300, 200),
        _ocr_item("Add to cart!", 500, 200),
        _ocr_item("add to cart", 700, 200),
    ]

    with pytest.raises(ValueError) as exc_info:
        OcrCoordinateResolver.resolve("Add to cart", ocr_results)

    message = str(exc_info.value)
    assert "Multiple OCR instances matched 'Add to cart' above threshold 0.80" in message
    assert "Add to cart (150, 210" in message
    assert "Add to carts (350, 210" in message
    assert "manual coordinates" in message
    assert "find_coordinates_by='manual'" in message
