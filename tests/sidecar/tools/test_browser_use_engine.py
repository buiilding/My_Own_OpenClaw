"""Tests for the Browser Use CLI engine adapter."""

from __future__ import annotations

from unittest import mock

import pytest

from tools.browser.browser_use_engine import BrowserActionError, BrowserUseEngineRuntime
from tools.browser.schemas import BrowserControlArgs

EXPLANATION = "Advance the active user task."


def _args(payload: dict[str, object]) -> BrowserControlArgs:
    return BrowserControlArgs.model_validate({"explanation": EXPLANATION, **payload})


@pytest.mark.asyncio
async def test_connect_starts_headed_browser_use_session() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={"_raw_text": "[0]<button>Go</button>"}),
    ) as run_cli:
        result = await runtime.execute(_args({"action": "connect"}))

    run_cli.assert_awaited_once_with("state", headed=True)
    assert result["connected"] is True
    assert result["mode"] == "browser_use"
    assert result["native_source"] == "browser_use.cli"


@pytest.mark.asyncio
async def test_navigate_uses_browser_use_open_command() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={"url": "https://example.com"}),
    ) as run_cli:
        result = await runtime.execute(
            _args({"action": "navigate", "url": "https://example.com"})
        )

    run_cli.assert_awaited_once_with("open", "https://example.com", headed=True)
    assert result["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_snapshot_paginates_browser_use_state_text() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={"_raw_text": "abcdef"}),
    ):
        result = await runtime.execute(
            _args({"action": "snapshot", "offset": 2, "limit": 3})
        )

    assert result["snapshot"] == "cde"
    assert result["returned_chars"] == 3
    assert result["has_more"] is True
    assert result["next_offset"] == 5


@pytest.mark.asyncio
async def test_click_rejects_windie_role_refs_at_browser_use_boundary() -> None:
    runtime = BrowserUseEngineRuntime()

    with pytest.raises(BrowserActionError) as exc_info:
        await runtime.execute(_args({"action": "click", "ref": "e12"}))

    assert exc_info.value.code == "INVALID_ARGUMENT"
    assert "numeric element index" in exc_info.value.message


@pytest.mark.asyncio
async def test_find_text_uses_browser_use_html_and_local_result_shape() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={"html": "<main>Hello browser use</main>"}),
    ) as run_cli:
        result = await runtime.execute(
            _args({"action": "find_text", "text": "browser"})
        )

    run_cli.assert_awaited_once_with("get", "html")
    assert result["match_count"] == 1
    assert result["matches"][0]["match"] == "browser"
