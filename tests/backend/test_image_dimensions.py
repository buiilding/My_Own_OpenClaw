import struct

from backend.src.agent.tools.preparation.helpers import image_dimensions as image_dims


def _jpeg_bytes(width: int, height: int) -> bytes:
    soi = b"\xff\xd8"
    app0 = (
        b"\xff\xe0"
        + struct.pack(">H", 16)
        + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    )
    sof0 = (
        b"\xff\xc0"
        + struct.pack(">H", 17)
        + b"\x08"
        + struct.pack(">H", height)
        + struct.pack(">H", width)
        + b"\x03"
        + b"\x01\x11\x00"
        + b"\x02\x11\x00"
        + b"\x03\x11\x00"
    )
    eoi = b"\xff\xd9"
    return soi + app0 + sof0 + eoi


def _png_bytes(width: int, height: int) -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\r"
        + b"IHDR"
        + struct.pack(">II", width, height)
    )


def test_parse_screen_resolution_accepts_string_and_dict_formats():
    assert image_dims.parse_screen_resolution("1920x1080") == (1920, 1080)
    assert image_dims.parse_screen_resolution(" 2560X1440 ") == (2560, 1440)
    assert image_dims.parse_screen_resolution({"width": 800, "height": 600}) == (800, 600)


def test_parse_screen_resolution_rejects_invalid_shapes():
    assert image_dims.parse_screen_resolution("1920") is None
    assert image_dims.parse_screen_resolution("wxh") is None
    assert image_dims.parse_screen_resolution({"width": 0, "height": 10}) is None
    assert image_dims.parse_screen_resolution({"width": "800", "height": 600}) is None


def test_get_image_dimensions_parses_png_from_decoded_payload(monkeypatch):
    monkeypatch.setattr(image_dims, "decode_screenshot_payload", lambda _payload, logger: _png_bytes(123, 45))

    assert image_dims.get_image_dimensions_from_screenshot_b64("ignored") == (123, 45)


def test_get_image_dimensions_parses_jpeg_from_decoded_payload(monkeypatch):
    monkeypatch.setattr(image_dims, "decode_screenshot_payload", lambda _payload, logger: _jpeg_bytes(640, 360))

    assert image_dims.get_image_dimensions_from_screenshot_b64("ignored") == (640, 360)


def test_get_image_dimensions_returns_none_for_invalid_or_unsupported_payload(monkeypatch):
    monkeypatch.setattr(image_dims, "decode_screenshot_payload", lambda _payload, logger: None)
    assert image_dims.get_image_dimensions_from_screenshot_b64("ignored") is None

    monkeypatch.setattr(image_dims, "decode_screenshot_payload", lambda _payload, logger: b"GIF89a")
    assert image_dims.get_image_dimensions_from_screenshot_b64("ignored") is None
