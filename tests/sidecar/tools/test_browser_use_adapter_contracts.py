"""Contract tests for Browser Use adapter message/payload stability."""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser.browser_tool import BrowserRuntimeAdapter


def _make_adapter(*, connected: bool = True, runtime_result: dict | None = None):
    runtime = SimpleNamespace(
        is_connected=connected,
        close=mock.AsyncMock(),
        execute_browser_use_action=mock.AsyncMock(
            return_value=runtime_result
            or {"success": True, "action": "status", "native_source": "browser_use.tools"}
        ),
    )
    controller = SimpleNamespace()
    return BrowserRuntimeAdapter(controller, runtime_provider=runtime), runtime


@pytest.mark.asyncio
async def test_snapshot_compat_error_message_contract() -> None:
    adapter, runtime = _make_adapter()

    result = await adapter.execute("snapshot", {"action": "snapshot", "format": "ai"})

    assert result.success is False
    assert result.action == "snapshot"
    assert result.error_code == "INVALID_ARGUMENT"
    assert (
        result.error
        == "snapshot no longer supports compatibility 'format'; use Browser Use snapshot semantics"
    )
    runtime.execute_browser_use_action.assert_not_awaited()


@pytest.mark.asyncio
async def test_extract_compat_error_message_contract() -> None:
    adapter, runtime = _make_adapter()

    result = await adapter.execute("extract", {"action": "extract", "query": "q", "mode": "structured"})

    assert result.success is False
    assert result.action == "extract"
    assert result.error_code == "INVALID_ARGUMENT"
    assert (
        result.error
        == "extract no longer supports compatibility 'mode'; use Browser Use extract semantics"
    )
    runtime.execute_browser_use_action.assert_not_awaited()


@pytest.mark.asyncio
async def test_wait_compat_error_message_contract() -> None:
    adapter, runtime = _make_adapter()

    result = await adapter.execute("wait", {"action": "wait", "state": "networkidle"})

    assert result.success is False
    assert result.action == "wait"
    assert result.error_code == "INVALID_ARGUMENT"
    assert (
        result.error
        == "wait no longer supports compatibility 'state'; provide Browser Use 'seconds'"
    )
    runtime.execute_browser_use_action.assert_not_awaited()


@pytest.mark.asyncio
async def test_screenshot_compat_error_message_contract() -> None:
    adapter, runtime = _make_adapter()

    result = await adapter.execute("screenshot", {"action": "screenshot", "ref": "3"})

    assert result.success is False
    assert result.action == "screenshot"
    assert result.error_code == "INVALID_ARGUMENT"
    assert (
        result.error
        == "screenshot no longer supports compatibility 'ref'; only Browser Use screenshot parameters are supported"
    )
    runtime.execute_browser_use_action.assert_not_awaited()


@pytest.mark.asyncio
async def test_open_payload_contract() -> None:
    adapter, runtime = _make_adapter()

    result = await adapter.execute("open", {"action": "open", "url": "https://example.com/new"})

    assert result.success is False
    assert result.action == "open"
    assert result.error == "Legacy browser action 'open' has been removed. Use navigate."
    assert result.error_code == "INVALID_ARGUMENT"
    assert result.data["legacy_action"] == "open"
    assert result.data["preferred_action"] == "navigate"
    runtime.execute_browser_use_action.assert_not_awaited()


@pytest.mark.asyncio
async def test_legacy_open_alias_deprecation_contract() -> None:
    adapter, runtime = _make_adapter()

    result = await adapter.execute("open", {"action": "open", "url": "https://example.com/new"})

    assert result.success is False
    assert result.action == "open"
    assert result.deprecation == "'open' is a legacy compatibility alias; prefer 'navigate'"
    assert result.warnings == [
        "'open' is a legacy compatibility alias; prefer 'navigate'"
    ]
    assert result.data["legacy_action"] == "open"
    assert result.data["preferred_action"] == "navigate"
    runtime.execute_browser_use_action.assert_not_awaited()


@pytest.mark.asyncio
async def test_canonical_status_routes_direct_runtime_dispatch() -> None:
    adapter, runtime = _make_adapter(
        runtime_result={
            "success": True,
            "action": "status",
            "native_source": "browser_use.state",
            "status": "connected",
        }
    )
    adapter.status = mock.AsyncMock(side_effect=AssertionError("status compat method should not run"))  # type: ignore[method-assign]

    result = await adapter.execute("status", {"action": "status"})

    assert result.success is True
    assert result.action == "status"
    runtime.execute_browser_use_action.assert_awaited_once_with(
        action="status",
        params={},
    )
