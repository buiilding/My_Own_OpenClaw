import pytest

from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
    CoordinateResolver,
    OcrCoordinateResolver,
    VisionCoordinateResolver,
)
from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.llm.parser_types import ParsedToolCall


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


def test_resolve_raises_for_empty_ocr_results():
    with pytest.raises(ValueError, match="OCR results are empty"):
        OcrCoordinateResolver.resolve("anything", [])


def test_resolve_raises_for_missing_text():
    with pytest.raises(ValueError, match="ocr_text parameter is required"):
        OcrCoordinateResolver.resolve("", [_ocr_item("hello", 0, 0)])


def test_resolve_raises_when_no_match_found():
    with pytest.raises(ValueError, match="Could not find text 'missing'"):
        OcrCoordinateResolver.resolve("missing", [_ocr_item("other", 10, 10)])


def test_ambiguous_error_limits_listed_matches_and_reports_hidden_count():
    matches = [
        {"item": _ocr_item(f"item-{i}", i * 10, i * 20), "score": 0.9 - i * 0.01}
        for i in range(10)
    ]

    message = OcrCoordinateResolver._build_ambiguous_match_error(
        "target",
        matches,
        threshold=0.8,
    )

    assert "Multiple OCR instances matched 'target' above threshold 0.80" in message
    assert "+2 more" in message


def test_extract_bbox_center_handles_invalid_shapes():
    assert OcrCoordinateResolver._extract_bbox_center(None) is None
    assert OcrCoordinateResolver._extract_bbox_center({"x": 1}) is None
    assert OcrCoordinateResolver._extract_bbox_center({"x": "bad", "y": 0, "width": 1, "height": 1}) is None
    assert OcrCoordinateResolver._extract_bbox_center({"x": 10, "y": 20, "width": 4, "height": 6}) == (12, 23)


class DummyVisionModel:
    def __init__(self, coordinates):
        self._coordinates = coordinates
        self.calls = []

    async def predict_click_coordinates(self, screenshot_data, description):
        self.calls.append((screenshot_data, description))
        return self._coordinates


class DummyVisionService:
    def __init__(self, is_initialized=True, model=None):
        self.is_initialized = is_initialized
        self.model = model


@pytest.mark.asyncio
async def test_vision_coordinate_resolver_success():
    model = DummyVisionModel((123, 456))
    service = DummyVisionService(is_initialized=True, model=model)

    x, y = await VisionCoordinateResolver.resolve("submit button", "base64-shot", service)

    assert (x, y) == (123, 456)
    assert model.calls == [("base64-shot", "submit button")]


@pytest.mark.asyncio
async def test_vision_coordinate_resolver_validation_errors():
    with pytest.raises(ValueError, match="description parameter is required"):
        await VisionCoordinateResolver.resolve("", "shot", DummyVisionService())

    with pytest.raises(ValueError, match="Vision service is not available or initialized"):
        await VisionCoordinateResolver.resolve(
            "desc",
            "shot",
            DummyVisionService(is_initialized=False, model=DummyVisionModel((1, 2))),
        )

    with pytest.raises(ValueError, match="Vision model instance is None"):
        await VisionCoordinateResolver.resolve("desc", "shot", DummyVisionService(is_initialized=True, model=None))

    with pytest.raises(ValueError, match="could not identify"):
        await VisionCoordinateResolver.resolve(
            "desc",
            "shot",
            DummyVisionService(is_initialized=True, model=DummyVisionModel(None)),
        )


@pytest.mark.asyncio
async def test_coordinate_resolver_routes_ocr_and_prediction_methods():
    ocr_resolver = OcrCoordinateResolver()
    vision_resolver = VisionCoordinateResolver()
    resolver = CoordinateResolver(ocr_resolver=ocr_resolver, vision_resolver=vision_resolver)

    ocr_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "find_coordinates_by": CoordinateFindingMethod.OCR,
            "ocr_text": "target",
        },
    )
    ocr_results = [_ocr_item("target", 50, 60, width=20, height=10)]
    ocr_coords = await resolver.resolve(ocr_call, "shot", ocr_results, vision_service=None)
    assert ocr_coords == (60, 65)

    model = DummyVisionModel((77, 88))
    vision_service = DummyVisionService(is_initialized=True, model=model)
    vision_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "find_coordinates_by": CoordinateFindingMethod.PREDICTION,
            "description": "submit",
        },
    )
    vision_coords = await resolver.resolve(vision_call, "vision-shot", None, vision_service)
    assert vision_coords == (77, 88)


@pytest.mark.asyncio
async def test_coordinate_resolver_raises_for_missing_inputs_and_unknown_method():
    resolver = CoordinateResolver(
        ocr_resolver=OcrCoordinateResolver(),
        vision_resolver=VisionCoordinateResolver(),
    )

    ocr_call_missing_results = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "find_coordinates_by": CoordinateFindingMethod.OCR,
            "ocr_text": "target",
        },
    )
    with pytest.raises(ValueError, match="OCR results are required"):
        await resolver.resolve(ocr_call_missing_results, "shot", None, vision_service=None)

    pred_call_missing_service = ParsedToolCall(
        tool_name="mouse_control",
        parameters={
            "find_coordinates_by": CoordinateFindingMethod.PREDICTION,
            "description": "target",
        },
    )
    with pytest.raises(ValueError, match="Vision service is required"):
        await resolver.resolve(pred_call_missing_service, "shot", [], vision_service=None)

    unknown_call = ParsedToolCall(
        tool_name="mouse_control",
        parameters={"find_coordinates_by": "manual"},
    )
    with pytest.raises(ValueError, match="Unknown coordinate finding method"):
        await resolver.resolve(unknown_call, "shot", [], vision_service=None)
