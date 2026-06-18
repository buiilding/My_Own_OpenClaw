"""Tests for the dedicated browser tool entrypoint."""

from __future__ import annotations

from unittest import mock

import pytest

from tools.browser.browser_tool import execute_browser

EXPLANATION = "Advance the active user task."


class FakeBrowserUseRuntime:
    calls: list[object] = []

    async def execute(self, args: object) -> dict[str, object]:
        self.calls.append(args)
        return {
            "success": True,
            "action": getattr(args, "action"),
            "native_source": "browser_use.cli",
        }


@pytest.mark.asyncio
async def test_browser_tool_executes_through_browser_use_engine() -> None:
    FakeBrowserUseRuntime.calls = []

    with mock.patch(
        "tools.browser.browser_tool.BrowserUseEngineRuntime",
        FakeBrowserUseRuntime,
    ):
        result = await execute_browser({"action": "connect", "explanation": EXPLANATION})

    assert result.success is True
    assert result.data["native_source"] == "browser_use.cli"
    assert len(FakeBrowserUseRuntime.calls) == 1
    assert getattr(FakeBrowserUseRuntime.calls[0], "action") == "connect"


@pytest.mark.asyncio
async def test_strict_validation_blocks_runtime_execution() -> None:
    with mock.patch("tools.browser.browser_tool.BrowserUseEngineRuntime") as runtime:
        result = await execute_browser(
            {"action": "snapshot", "format": "aria", "explanation": EXPLANATION}
        )

    assert result.success is False
    assert "format" in (result.error or "")
    runtime.assert_not_called()


@pytest.mark.asyncio
async def test_removed_alias_returns_invalid_argument_error() -> None:
    with mock.patch("tools.browser.browser_tool.BrowserUseEngineRuntime") as runtime:
        result = await execute_browser(
            {
                "action": "open",
                "url": "https://example.com",
                "explanation": EXPLANATION,
            }
        )

    assert result.success is False
    assert "open" in (result.error or "")
    runtime.assert_not_called()
