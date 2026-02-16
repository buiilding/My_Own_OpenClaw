"""Regression tests for the Browser Use compatibility adapter."""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser_use_adapter import BrowserUseCompatibilityAdapter


@dataclass
class DummySnapshot:
    text: str
    url: str = ""
    title: str = ""
    ref_count: int = 0


@pytest.fixture
def make_controller():
    def _make_controller(*, connected: bool = True) -> SimpleNamespace:
        controller = SimpleNamespace()
        controller.is_connected = connected
        controller.close = mock.AsyncMock()
        controller.wait_for_load = mock.AsyncMock(return_value={"success": True})
        controller.get_page_snapshot = mock.AsyncMock(
            return_value=DummySnapshot(text="snapshot", url="https://example.com", title="Example")
        )
        controller.evaluate = mock.AsyncMock(
            return_value={
                "success": True,
                "result": {
                    "title": "Example",
                    "url": "https://example.com",
                    "content": "Page Text:\nExample",
                    "structured": {"tables": [], "lists": []},
                },
            }
        )
        controller.switch_tab = mock.AsyncMock(return_value=True)
        controller.click = mock.AsyncMock(return_value={"success": True, "ref": "e1"})
        return controller

    return _make_controller


class TestBrowserUseCompatibilityAdapter:
    @pytest.mark.asyncio
    async def test_execute_unknown_action_returns_unsupported(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller())

        result = await adapter.execute("unknown_action", {})

        assert result.success is False
        assert result.action == "unknown_action"
        assert result.error_code == "ACTION_UNSUPPORTED"

    @pytest.mark.asyncio
    async def test_snapshot_requires_connection(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller(connected=False))

        result = await adapter.execute("snapshot", {"action": "snapshot"})

        assert result.success is False
        assert result.action == "snapshot"
        assert result.error_code == "BROWSER_NOT_CONNECTED"

    @pytest.mark.asyncio
    async def test_snapshot_rejects_efficient_mode_for_aria(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller())

        result = await adapter.execute(
            "snapshot",
            {"action": "snapshot", "format": "aria", "mode": "efficient"},
        )

        assert result.success is False
        assert result.action == "snapshot"
        assert result.error_code == "INVALID_ARGUMENT"
        assert "requires format='ai'" in (result.error or "")

    @pytest.mark.asyncio
    async def test_snapshot_paginates_and_retries_on_zero_refs(self, make_controller):
        controller = make_controller()
        full_text = "x" * 6000
        controller.get_page_snapshot.side_effect = [
            DummySnapshot(
                text=full_text,
                url="https://example.com/page",
                title="Example",
                ref_count=0,
            ),
            DummySnapshot(
                text=full_text,
                url="https://example.com/page",
                title="Example",
                ref_count=3,
            ),
        ]
        adapter = BrowserUseCompatibilityAdapter(controller)

        result = await adapter.execute(
            "snapshot",
            {
                "action": "snapshot",
                "format": "ai",
                "offset": 4500,
                "limit": 300,
            },
        )

        assert result.success is True
        assert result.action == "snapshot"
        assert result.data["wait_until"] == "load"
        assert result.data["snapshot"] == full_text[4500:4800]
        assert result.data["returned_chars"] == 300
        assert result.data["total_chars"] == len(full_text)
        assert result.data["has_more"] is True
        assert result.data["next_offset"] == 4800

        assert controller.get_page_snapshot.await_count == 2
        first_call = controller.get_page_snapshot.await_args_list[0].kwargs
        second_call = controller.get_page_snapshot.await_args_list[1].kwargs
        assert first_call["max_chars"] == 5312
        assert first_call["depth"] == 4
        assert first_call["interactive"] is True
        assert first_call["compact"] is True
        assert second_call["depth"] == 12

    @pytest.mark.asyncio
    async def test_snapshot_rejects_window_above_cap(self, make_controller):
        controller = make_controller()
        adapter = BrowserUseCompatibilityAdapter(controller)

        result = await adapter.execute(
            "snapshot",
            {
                "action": "snapshot",
                "format": "ai",
                "offset": 119_500,
                "limit": 1_000,
            },
        )

        assert result.success is False
        assert result.error_code == "INVALID_ARGUMENT"
        assert "offset + limit exceeds maximum snapshot window" in (result.error or "")
        controller.get_page_snapshot.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_extract_structured_mode_returns_structured_payload(self, make_controller):
        controller = make_controller()
        controller.evaluate.return_value = {
            "success": True,
            "result": {
                "title": "Example",
                "url": "https://example.com/table",
                "content": "Page Text:\nIgnored in structured mode",
                "structured": {
                    "tables": [
                        {
                            "index": 1,
                            "headers": ["Name", "Role"],
                            "rows": [["A", "Engineer"]],
                        }
                    ],
                    "lists": [],
                },
            },
        }
        adapter = BrowserUseCompatibilityAdapter(controller)

        result = await adapter.execute(
            "extract",
            {
                "action": "extract",
                "query": "engineer",
                "mode": "structured",
            },
        )

        assert result.success is True
        assert result.action == "extract"
        assert result.data["mode"] == "structured"
        assert "tables" in result.data["result"]
        assert result.data["structured"]["tables"][0]["headers"] == ["Name", "Role"]

    @pytest.mark.asyncio
    async def test_extract_rejects_invalid_mode(self, make_controller):
        adapter = BrowserUseCompatibilityAdapter(make_controller())

        result = await adapter.execute(
            "extract",
            {
                "action": "extract",
                "query": "test",
                "mode": "unsupported",
            },
        )

        assert result.success is False
        assert result.action == "extract"
        assert result.error_code == "INVALID_ARGUMENT"
        assert "mode must be one of" in (result.error or "")

    @pytest.mark.asyncio
    async def test_act_click_routes_to_click_action_result(self, make_controller):
        controller = make_controller()
        adapter = BrowserUseCompatibilityAdapter(controller)

        result = await adapter.execute(
            "act",
            {
                "action": "act",
                "request": {
                    "kind": "click",
                    "ref": "e1",
                },
            },
        )

        assert result.success is True
        assert result.action == "click"
        assert result.data["action"] == "click"
        controller.click.assert_awaited_once_with(
            ref="e1",
            double_click=False,
            button="left",
        )
