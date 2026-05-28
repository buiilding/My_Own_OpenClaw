import pytest

from backend.src.agent.tools.processing.transformer import ResultTransformer
from backend.src.core.interfaces.tool import ToolResult


@pytest.mark.asyncio
async def test_transformer_preserves_screenshot_content_type_for_history_image():
    transformer = ResultTransformer()
    result = ToolResult(
        success=True,
        data={
            "output": "Screenshot captured successfully.",
            "screenshot": "jpeg-b64",
            "screenshot_content_type": "image/jpeg",
        },
    )

    processed = await transformer.transform("screenshot", result)

    assert processed.formatted_message == "Screenshot captured successfully."
    assert processed.screenshot_data == "data:image/jpeg;base64,jpeg-b64"


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
