from unittest import mock

import pytest

from tools.browser.action_executor import BrowserActionExecutor


@pytest.mark.asyncio
async def test_fill_fields_aggregates_successes_and_errors():
    executor = BrowserActionExecutor(mock.MagicMock())
    executor.type_text = mock.AsyncMock(
        side_effect=[
            {"success": True},
            {"success": False, "error": "field failed"},
        ]
    )

    result = await executor.fill_fields(
        [
            {"ref": "1", "text": "ok"},
            {"ref": "2", "text": "bad"},
            {"ref": None, "text": "skip"},
        ]
    )

    assert result == {
        "success": False,
        "action": "fill",
        "filled": 1,
        "errors": [
            {"ref": "2", "error": "field failed"},
            {"ref": "None", "error": "Each field must include string ref/text"},
        ],
    }


@pytest.mark.asyncio
async def test_set_device_rejects_unknown_presets():
    controller = mock.MagicMock()
    controller._page = object()
    executor = BrowserActionExecutor(controller)

    result = await executor.set_device("blackberry curve")

    assert result == {
        "success": False,
        "error": "Unknown device preset: blackberry curve",
    }
