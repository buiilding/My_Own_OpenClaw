"""Covers image dimensions behavior in the backend test suite."""

import struct

import backend.src.agent.tools.preparation.helpers.image_dimensions as image_dims


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


def test_parse_png_dimensions_rejects_short_or_non_ihdr_payloads():
    assert image_dims._parse_png_dimensions(b"\x89PNG\r\n\x1a\n") is None

    non_ihdr = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\r"
        + b"IDAT"
        + struct.pack(">II", 10, 20)
    )
    assert image_dims._parse_png_dimensions(non_ihdr) is None


def test_parse_jpeg_dimensions_rejects_invalid_or_incomplete_segments():
    # Segment length < 2 is invalid.
    invalid_seg_len = b"\xff\xd8" + b"\xff\xe0" + b"\x00\x01"
    assert image_dims._parse_jpeg_dimensions(invalid_seg_len) is None

    # SOS before any SOF marker means no dimensions available.
    sos_before_sof = b"\xff\xd8" + b"\xff\xda" + b"\x00\x08" + b"abcdef"
    assert image_dims._parse_jpeg_dimensions(sos_before_sof) is None
