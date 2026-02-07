from backend.src.services.vision.coordinates import (
    extract_first_point,
    extract_last_bbox,
    scale_norm_to_pixels,
)


def test_extract_first_point_parses_decimals():
    result = extract_first_point("coords [[12.5, 99]] end")
    assert result == (12.5, 99.0)


def test_extract_first_point_returns_none_when_missing():
    assert extract_first_point("no coordinates here") is None


def test_extract_first_point_accepts_negative_values():
    result = extract_first_point("coords [[-12.5, 99]] end")
    assert result == (-12.5, 99.0)


def test_extract_last_bbox_returns_last_match():
    text = "first [[1,2,3,4]] then [[5,6,7,8]]"
    result = extract_last_bbox(text)
    assert result == (5.0, 6.0, 7.0, 8.0)


def test_extract_last_bbox_accepts_signed_decimals():
    result = extract_last_bbox("bbox [[-1.5,2.25,3.5,-4.75]]")
    assert result == (-1.5, 2.25, 3.5, -4.75)


def test_scale_norm_to_pixels_clamps_bounds():
    assert scale_norm_to_pixels(0, 0, 100, 200) == (0, 0)
    assert scale_norm_to_pixels(1000, 1000, 100, 200) == (99, 199)
    assert scale_norm_to_pixels(1500, -10, 100, 200) == (99, 0)
