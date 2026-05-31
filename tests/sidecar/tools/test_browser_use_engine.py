"""Tests for the Browser Use CLI engine adapter."""

from __future__ import annotations

import os
from pathlib import Path
from unittest import mock

import pytest

from tools.browser.browser_use_engine import (
    BrowserActionError,
    BrowserUseEngineRuntime,
    _parse_cli_json,
)
from tools.browser.schemas import BrowserControlArgs

EXPLANATION = "Advance the active user task."


def _args(payload: dict[str, object]) -> BrowserControlArgs:
    return BrowserControlArgs.model_validate({"explanation": EXPLANATION, **payload})


def test_parse_cli_json_accepts_prefixed_close_output() -> None:
    parsed = _parse_cli_json('Closing...{"success": true, "data": {"shutdown": true}}')

    assert parsed == {"success": True, "data": {"shutdown": True}}


@pytest.mark.asyncio
async def test_run_cli_requests_headed_when_starting_session(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    cdp_url = "http://127.0.0.1:9333"
    captured: dict[str, object] = {}

    class FakeProcess:
        returncode = 0

        async def communicate(self) -> tuple[bytes, bytes]:
            return b'{"success": true, "data": {"title": "Example"}}', b""

    async def fake_create_subprocess_exec(*command: str, **kwargs: object) -> FakeProcess:
        captured["command"] = command
        captured["env"] = kwargs.get("env")
        return FakeProcess()

    with (
        mock.patch(
            "tools.browser.browser_use_engine._feature_pack_pythonpath",
            return_value=None,
        ),
        mock.patch(
            "tools.browser.browser_use_engine.ensure_chrome_with_cdp",
            new=mock.AsyncMock(return_value=cdp_url),
        ),
        mock.patch(
            "tools.browser.browser_use_engine.asyncio.create_subprocess_exec",
            new=fake_create_subprocess_exec,
        ),
    ):
        result = await runtime._run_cli("get", "title")

    assert result == {"title": "Example"}
    command = captured["command"]
    assert isinstance(command, tuple)
    assert "--headed" in command
    assert ("--cdp-url", cdp_url) == command[command.index("--cdp-url") : command.index("--cdp-url") + 2]
    assert command[-2:] == ("get", "title")


@pytest.mark.asyncio
async def test_run_cli_reuses_running_headed_session_without_config_check(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / "windieos.state.json"
    state_path.write_text(
        f'{{"phase": "running", "pid": {os.getpid()}, "config": {{"headed": false, "cdp_url": "http://127.0.0.1:9333"}}}}'
    )
    captured: dict[str, object] = {}

    class FakeProcess:
        returncode = 0

        async def communicate(self) -> tuple[bytes, bytes]:
            return b'{"success": true, "data": {"title": "Example"}}', b""

    async def fake_create_subprocess_exec(*command: str, **kwargs: object) -> FakeProcess:
        captured["command"] = command
        captured["env"] = kwargs.get("env")
        return FakeProcess()

    with (
        mock.patch(
            "tools.browser.browser_use_engine._feature_pack_pythonpath",
            return_value=None,
        ),
        mock.patch(
            "tools.browser.browser_use_engine.asyncio.create_subprocess_exec",
            new=fake_create_subprocess_exec,
        ),
    ):
        result = await runtime._run_cli("get", "title")

    assert result == {"title": "Example"}
    command = captured["command"]
    assert isinstance(command, tuple)
    assert "--headed" not in command
    assert command[-2:] == ("get", "title")


@pytest.mark.asyncio
async def test_connect_starts_headed_browser_use_session(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    cdp_url = "http://127.0.0.1:9333"

    with (
        mock.patch.object(
            runtime,
            "_ensure_windie_cdp_target",
            new=mock.AsyncMock(return_value=cdp_url),
        ),
        mock.patch.object(
            runtime,
            "_run_cli",
            new=mock.AsyncMock(return_value={"_raw_text": "[0]<button>Go</button>"}),
        ) as run_cli,
    ):
        result = await runtime.execute(_args({"action": "connect"}))

    run_cli.assert_awaited_once_with("state", headed=True, cdp_url=cdp_url)
    assert result["connected"] is True
    assert result["cdp_url"] == cdp_url
    assert result["mode"] == "browser_use"
    assert result["native_source"] == "browser_use.cli"


@pytest.mark.asyncio
async def test_connect_closes_incompatible_session_before_starting_windie_cdp(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    cdp_url = "http://127.0.0.1:9333"
    state_path = tmp_path / "windieos.state.json"
    state_path.write_text(
        f'{{"phase": "running", "pid": {os.getpid()}, "config": {{"headed": false}}}}'
    )

    async def run_cli(*args: str, **kwargs: object) -> dict[str, object]:
        if args == ("close",):
            state_path.write_text('{"phase": "stopped", "config": {"headed": false}}')
            return {"shutdown": True}
        if args == ("state",):
            return {"_raw_text": "[0]<button>Go</button>"}
        raise AssertionError(f"unexpected CLI call: {args!r} {kwargs!r}")

    with (
        mock.patch(
            "tools.browser.browser_use_engine.ensure_chrome_with_cdp",
            new=mock.AsyncMock(return_value=cdp_url),
        ),
        mock.patch.object(runtime, "_run_cli", new=mock.AsyncMock(side_effect=run_cli)) as run_cli_mock,
    ):
        result = await runtime.execute(_args({"action": "connect"}))

    assert run_cli_mock.await_args_list[0] == mock.call("close", headed=False)
    assert run_cli_mock.await_args_list[1] == mock.call("state", headed=True, cdp_url=cdp_url)
    assert result["connected"] is True


@pytest.mark.asyncio
async def test_connect_errors_when_incompatible_session_survives_close(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    cdp_url = "http://127.0.0.1:9333"
    state_path = tmp_path / "windieos.state.json"
    state_path.write_text(
        f'{{"phase": "running", "pid": {os.getpid()}, "config": {{"headed": false}}}}'
    )

    with (
        mock.patch.object(
            runtime,
            "_run_cli",
            new=mock.AsyncMock(return_value={"shutdown": True}),
        ) as run_cli,
        mock.patch(
            "tools.browser.browser_use_engine.ensure_chrome_with_cdp",
            new=mock.AsyncMock(return_value=cdp_url),
        ),
        mock.patch(
            "tools.browser.browser_use_engine.HEADLESS_RECOVERY_TIMEOUT_SECONDS",
            0.01,
        ),
    ):
        with pytest.raises(BrowserActionError) as exc_info:
            await runtime.execute(_args({"action": "connect"}))

    run_cli.assert_awaited_once_with("close", headed=False)
    assert "non-WindieOS profile" in exc_info.value.message


@pytest.mark.asyncio
async def test_status_does_not_claim_starting_session_is_connected(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / "windieos.state.json"
    state_path.write_text('{"phase": "starting"}')

    with mock.patch.object(runtime, "_run_cli", new=mock.AsyncMock()) as run_cli:
        result = await runtime.execute(_args({"action": "status"}))

    run_cli.assert_not_awaited()
    assert result["connected"] is False
    assert result["phase"] == "starting"


@pytest.mark.asyncio
async def test_status_does_not_claim_headless_session_is_connected(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / "windieos.state.json"
    state_path.write_text('{"phase": "running", "config": {"headed": false}}')

    with mock.patch.object(runtime, "_run_cli", new=mock.AsyncMock()) as run_cli:
        result = await runtime.execute(_args({"action": "status"}))

    run_cli.assert_not_awaited()
    assert result["connected"] is False
    assert result["phase"] == "running"


@pytest.mark.asyncio
async def test_status_accepts_windie_cdp_session_even_when_browser_use_headed_flag_is_false(tmp_path: Path) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / "windieos.state.json"
    state_path.write_text(
        f'{{"phase": "running", "pid": {os.getpid()}, "config": {{"headed": false, "cdp_url": "http://127.0.0.1:9333"}}}}'
    )

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(
            side_effect=[
                {"title": "Example"},
                {"result": "https://example.com"},
            ]
        ),
    ) as run_cli:
        result = await runtime.execute(_args({"action": "status"}))

    assert run_cli.await_args_list == [
        mock.call("get", "title"),
        mock.call("eval", "window.location.href"),
    ]
    assert result["connected"] is True
    assert result["url"] == "https://example.com"


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

    run_cli.assert_awaited_once_with("open", "https://example.com")
    assert result["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_navigate_browser_internal_url_uses_python_goto_to_preserve_scheme() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={}),
    ) as run_cli:
        result = await runtime.execute(
            _args({"action": "navigate", "url": "chrome://settings/syncSetup"})
        )

    run_cli.assert_awaited_once_with(
        "python",
        'browser.goto("chrome://settings/syncSetup")',
    )
    assert result["url"] == "chrome://settings/syncSetup"
    assert result["browser_internal"] is True


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

    assert result["output"] == "cde"
    assert "snapshot" not in result
    assert result["returned_chars"] == 3
    assert result["has_more"] is True
    assert result["next_offset"] == 5


@pytest.mark.asyncio
async def test_snapshot_include_screenshot_uses_default_screenshot_name() -> None:
    runtime = BrowserUseEngineRuntime()

    with (
        mock.patch.object(
            runtime,
            "_run_cli",
            new=mock.AsyncMock(
                side_effect=[
                    {"_raw_text": "[0]<button>Continue</button>"},
                    {"saved": "/tmp/browser-screenshot.png", "size": 9},
                ]
            ),
        ) as run_cli,
        mock.patch(
            "tools.browser.browser_use_engine.resolve_browser_path",
            return_value=Path("/tmp/browser-screenshot.png"),
        ),
    ):
        result = await runtime.execute(
            _args({"action": "snapshot", "include_screenshot": True})
        )

    assert result["screenshot_path"] == "/tmp/browser-screenshot.png"
    assert result["screenshot_content_type"] == "image/png"
    assert run_cli.await_args_list[-1].args == (
        "screenshot",
        "/tmp/browser-screenshot.png",
    )


@pytest.mark.asyncio
async def test_close_uses_config_neutral_browser_use_shutdown() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={"shutdown": True}),
    ) as run_cli:
        result = await runtime.execute(_args({"action": "close"}))

    run_cli.assert_awaited_once_with("close", headed=False)
    assert result["shutdown"] is True


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
    assert "Found 1 match for 'browser'" in result["output"]
