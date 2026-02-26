from backend.src.core.types.enums import CoordinateFindingMethod
from backend.src.core.utils.coordinate_methods import normalize_coordinate_method


def test_normalize_coordinate_method_accepts_enum_values():
    assert normalize_coordinate_method(CoordinateFindingMethod.OCR) == "ocr"
    assert normalize_coordinate_method(CoordinateFindingMethod.PREDICTION) == "prediction"


def test_normalize_coordinate_method_normalizes_string_inputs():
    assert normalize_coordinate_method("  OCR  ") == "ocr"
    assert normalize_coordinate_method("Prediction") == "prediction"


def test_normalize_coordinate_method_uses_default_for_empty_or_invalid_input():
    assert normalize_coordinate_method("", default="ocr") == "ocr"
    assert normalize_coordinate_method(None, default="prediction") == "prediction"


def test_normalize_coordinate_method_falls_back_to_lowercased_string_representation():
    assert normalize_coordinate_method(123) == "123"
    assert normalize_coordinate_method(None) == "none"
