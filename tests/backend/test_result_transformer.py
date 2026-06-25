"""Covers result transformer behavior in the backend test suite."""

import base64

import pytest

from backend.src.agent.tools.processing.transformer import ResultTransformer
from backend.src.core.interfaces.tool import ToolResult

JPEG_BASE64 = base64.b64encode(b"\xff\xd8\xff\xe0jpeg-bytes").decode("ascii")
PNG_BASE64 = base64.b64encode(b"\x89PNG\r\n\x1a\npng-bytes").decode("ascii")


@pytest.mark.asyncio
async def test_transformer_preserves_screenshot_content_type_for_history_image():
    transformer = ResultTransformer()
    result = ToolResult(
        success=True,
        data={
            "output": "Screenshot captured successfully.",
            "screenshot": JPEG_BASE64,
            "screenshot_content_type": "image/jpeg",
        },
    )

    processed = await transformer.transform("screenshot", result)

    assert processed.formatted_message == "Screenshot captured successfully."
    assert processed.screenshot_data == f"data:image/jpeg;base64,{JPEG_BASE64}"


@pytest.mark.asyncio
async def test_transformer_detects_jpeg_screenshot_when_content_type_is_missing():
    transformer = ResultTransformer()
    result = ToolResult(
        success=True,
        data={
            "output": "Screenshot captured successfully.",
            "screenshot": JPEG_BASE64,
        },
    )

    processed = await transformer.transform("screenshot", result)

    assert processed.screenshot_data == f"data:image/jpeg;base64,{JPEG_BASE64}"


@pytest.mark.asyncio
async def test_transformer_repairs_mismatched_screenshot_data_url_mime():
    transformer = ResultTransformer()
    result = ToolResult(
        success=True,
        data={
            "output": "Screenshot captured successfully.",
            "screenshot": f"data:image/png;base64,{JPEG_BASE64}",
        },
    )

    processed = await transformer.transform("screenshot", result)

    assert processed.screenshot_data == f"data:image/jpeg;base64,{JPEG_BASE64}"


@pytest.mark.asyncio
async def test_transformer_drops_unidentified_bare_screenshot_payload():
    transformer = ResultTransformer()
    result = ToolResult(
        success=True,
        data={
            "output": "Screenshot captured successfully.",
            "screenshot": base64.b64encode(b"not-image").decode("ascii"),
        },
    )

    processed = await transformer.transform("screenshot", result)

    assert processed.screenshot_data is None


@pytest.mark.asyncio
async def test_transformer_keeps_existing_screenshot_data_url():
    transformer = ResultTransformer()
    result = ToolResult(
        success=True,
        data={
            "output": "Screenshot captured successfully.",
            "screenshot": "data:image/webp;base64,webp-b64",
            "screenshot_content_type": "image/jpeg",
        },
    )

    processed = await transformer.transform("screenshot", result)

    assert processed.screenshot_data == "data:image/webp;base64,webp-b64"
