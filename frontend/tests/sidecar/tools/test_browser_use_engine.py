"""Tests for the Browser Use CLI engine adapter."""

from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import pytest
from tools.browser import browser_use_engine, content_extraction, file_store
from tools.browser.browser_use_engine import (
    BrowserActionError,
    BrowserUseEngineRuntime,
    DEFAULT_SESSION_NAME,
    ENV_AGENT_BROWSER_USE_CLI,
    ENV_AGENT_BROWSER_USE_COMMAND_TIMEOUT_SECONDS,
    ENV_AGENT_BROWSER_USE_HOME,
    ENV_AGENT_BROWSER_USE_SESSION,
    ENV_WINDIE_BROWSER_USE_CLI,
    ENV_WINDIE_BROWSER_USE_COMMAND_TIMEOUT_SECONDS,
    ENV_WINDIE_BROWSER_USE_HOME,
    ENV_WINDIE_BROWSER_USE_SESSION,
    _base_command,
    _browser_use_home,
    _browser_use_session,
    _browser_use_timeout,
    _extract_response_data,
    _parse_cli_json,
    shutdown_browser_runtime,
)
from windie_shared.browser_contract import BrowserControlArgs

EXPLANATION = "Advance the active user task."


def _args(payload: dict[str, object]) -> BrowserControlArgs:
    return BrowserControlArgs.model_validate({"explanation": EXPLANATION, **payload})


def test_parse_cli_json_accepts_prefixed_close_output() -> None:
    parsed = _parse_cli_json('Closing...{"success": true, "data": {"shutdown": true}}')

    assert parsed == {"success": True, "data": {"shutdown": True}}


def test_default_browser_use_session_name_is_generic() -> None:
    assert DEFAULT_SESSION_NAME == "desktop-agent"


def test_browser_use_env_resolvers_prefer_generic_alias(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generic_home = tmp_path / "generic-home"
    legacy_home = tmp_path / "legacy-browser-home"
    monkeypatch.setenv(ENV_AGENT_BROWSER_USE_HOME, str(generic_home))
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_HOME, str(legacy_home))
    monkeypatch.setenv(ENV_AGENT_BROWSER_USE_SESSION, "agent-session")
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_SESSION, "legacy-browser-session")
    monkeypatch.setenv(ENV_AGENT_BROWSER_USE_COMMAND_TIMEOUT_SECONDS, "7")
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_COMMAND_TIMEOUT_SECONDS, "9")
    monkeypatch.setenv(ENV_AGENT_BROWSER_USE_CLI, "agent-browser-use")
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_CLI, "legacy-browser-use")

    assert _browser_use_home() == str(generic_home)
    assert _browser_use_session() == "agent-session"
    assert _browser_use_timeout() == 7.0
    assert _base_command() == ["agent-browser-use"]


def test_browser_use_env_resolvers_preserve_windie_alias(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    legacy_home = tmp_path / "legacy-browser-home"
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_HOME, str(legacy_home))
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_SESSION, "legacy-agent-session")
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_COMMAND_TIMEOUT_SECONDS, "9")
    monkeypatch.setenv(ENV_WINDIE_BROWSER_USE_CLI, "legacy-browser-use")

    assert _browser_use_home() == str(legacy_home)
    assert _browser_use_session() == "legacy-agent-session"
    assert _browser_use_timeout() == 9.0
    assert _base_command() == ["legacy-browser-use"]


def test_browser_runtime_source_copy_uses_local_runtime_terms() -> None:
    sources = "\n".join(
        Path(module.__file__).read_text(encoding="utf-8")
        for module in [browser_use_engine, content_extraction, file_store]
    )

    assert "local-runtime browser actions" in sources
    assert "local-runtime Python environment" in sources
    assert "local-runtime-managed Chrome process" in sources
    assert "SDK/local-runtime restarts" in sources
    assert "sidecar " + "browser" not in sources
    assert "sidecar " + "Python" not in sources
    assert "sidecar" + "-managed" not in sources
    assert "SDK/" + "sidecar " + "restarts" not in sources


def test_browser_extract_docs_match_deterministic_runtime_path() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    browser_control_doc = (
        repo_root / "docs" / "browser" / "browser_control.md"
    ).read_text(encoding="utf-8")

    assert "deterministic markdown/focused-excerpt path" in browser_control_doc
    assert "WINDIE_BROWSER_USE_EXTRACTION_" not in browser_control_doc


def test_extract_response_data_rejects_non_object_data() -> None:
    with pytest.raises(BrowserActionError, match="non-object data"):
        _extract_response_data({"success": True, "data": "done"})


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

    async def fake_create_subprocess_exec(
        *command: str, **kwargs: object
    ) -> FakeProcess:
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
    assert ("--cdp-url", cdp_url) == command[
        command.index("--cdp-url") : command.index("--cdp-url") + 2
    ]
    assert command[-2:] == ("get", "title")


@pytest.mark.asyncio
async def test_run_cli_reuses_running_headed_session_without_config_check(
    tmp_path: Path,
) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / f"{DEFAULT_SESSION_NAME}.state.json"
    state_path.write_text(
        f'{{"phase": "running", "pid": {os.getpid()}, "config": {{"headed": false, "cdp_url": "http://127.0.0.1:9333"}}}}'
    )
    captured: dict[str, object] = {}

    class FakeProcess:
        returncode = 0

        async def communicate(self) -> tuple[bytes, bytes]:
            return b'{"success": true, "data": {"title": "Example"}}', b""

    async def fake_create_subprocess_exec(
        *command: str, **kwargs: object
    ) -> FakeProcess:
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
            "_ensure_dedicated_cdp_target",
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
    assert result["scope"] == "dedicated_browser"
    assert result["native_source"] == "browser_use.cli"
    assert result["output"] == "Connected to the browser."
    assert "snapshot" not in result


@pytest.mark.asyncio
async def test_connect_reuses_running_dedicated_cdp_session_without_config_check(
    tmp_path: Path,
) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    cdp_url = "http://127.0.0.1:9333"
    state_path = tmp_path / f"{DEFAULT_SESSION_NAME}.state.json"
    state_path.write_text(
        f'{{"phase": "running", "pid": {os.getpid()}, "config": {{"headed": false, "cdp_url": "{cdp_url}"}}}}'
    )

    with (
        mock.patch.object(
            runtime,
            "_ensure_dedicated_cdp_target",
            new=mock.AsyncMock(return_value=cdp_url),
        ),
        mock.patch.object(
            runtime,
            "_run_cli",
            new=mock.AsyncMock(return_value={"_raw_text": "[0]<button>Go</button>"}),
        ) as run_cli,
    ):
        result = await runtime.execute(_args({"action": "connect"}))

    run_cli.assert_awaited_once_with("state")
    assert result["connected"] is True
    assert result["cdp_url"] == cdp_url
    assert result["scope"] == "dedicated_browser"


@pytest.mark.asyncio
async def test_connect_closes_incompatible_session_before_starting_dedicated_cdp(
    tmp_path: Path,
) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    cdp_url = "http://127.0.0.1:9333"
    state_path = tmp_path / f"{DEFAULT_SESSION_NAME}.state.json"
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
        mock.patch.object(
            runtime, "_run_cli", new=mock.AsyncMock(side_effect=run_cli)
        ) as run_cli_mock,
    ):
        result = await runtime.execute(_args({"action": "connect"}))

    assert run_cli_mock.await_args_list[0] == mock.call("close", headed=False)
    assert run_cli_mock.await_args_list[1] == mock.call(
        "state", headed=True, cdp_url=cdp_url
    )
    assert result["connected"] is True


@pytest.mark.asyncio
async def test_connect_errors_when_incompatible_session_survives_close(
    tmp_path: Path,
) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    cdp_url = "http://127.0.0.1:9333"
    state_path = tmp_path / f"{DEFAULT_SESSION_NAME}.state.json"
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
    assert "non-dedicated profile" in exc_info.value.message


@pytest.mark.asyncio
async def test_status_does_not_claim_starting_session_is_connected(
    tmp_path: Path,
) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / f"{DEFAULT_SESSION_NAME}.state.json"
    state_path.write_text('{"phase": "starting"}')

    with mock.patch.object(runtime, "_run_cli", new=mock.AsyncMock()) as run_cli:
        result = await runtime.execute(_args({"action": "status"}))

    run_cli.assert_not_awaited()
    assert result["connected"] is False
    assert result["phase"] == "starting"


@pytest.mark.asyncio
async def test_status_does_not_claim_headless_session_is_connected(
    tmp_path: Path,
) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / f"{DEFAULT_SESSION_NAME}.state.json"
    state_path.write_text('{"phase": "running", "config": {"headed": false}}')

    with mock.patch.object(runtime, "_run_cli", new=mock.AsyncMock()) as run_cli:
        result = await runtime.execute(_args({"action": "status"}))

    run_cli.assert_not_awaited()
    assert result["connected"] is False
    assert result["phase"] == "running"


@pytest.mark.asyncio
async def test_status_accepts_dedicated_cdp_session_even_when_browser_use_headed_flag_is_false(
    tmp_path: Path,
) -> None:
    runtime = BrowserUseEngineRuntime()
    runtime._home = str(tmp_path)
    state_path = tmp_path / f"{DEFAULT_SESSION_NAME}.state.json"
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
    assert result["scope"] == "dedicated_browser"


@pytest.mark.asyncio
async def test_profiles_use_generic_dedicated_browser_scope() -> None:
    runtime = BrowserUseEngineRuntime()

    result = await runtime.execute(_args({"action": "profiles"}))

    assert result["profiles"] == [
        {
            "name": DEFAULT_SESSION_NAME,
            "driver": "browser-use",
            "scope": "dedicated_browser",
        }
    ]


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
async def test_navigate_does_not_promote_browser_use_message_to_output() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={"message": "Browser Use legacy text"}),
    ):
        result = await runtime.execute(
            _args({"action": "navigate", "url": "https://example.com"})
        )

    assert result["message"] == "Browser Use legacy text"
    assert result["output"] == "Opened https://example.com."


@pytest.mark.asyncio
async def test_replace_file_uses_canonical_string_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AGENT_BROWSER_FILES_DIR", str(tmp_path))
    target = tmp_path / "notes.txt"
    target.write_text("before before", encoding="utf-8")
    runtime = BrowserUseEngineRuntime()

    result = await runtime.execute(
        _args(
            {
                "action": "replace_file",
                "file_name": "notes.txt",
                "old_string": "before",
                "new_string": "after",
            }
        )
    )

    assert result["replacements"] == 2
    assert target.read_text(encoding="utf-8") == "after after"


@pytest.mark.asyncio
async def test_navigate_browser_internal_url_uses_python_goto_to_preserve_scheme() -> (
    None
):
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
async def test_extract_returns_model_text_only_in_output() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_read_markdown",
        new=mock.AsyncMock(
            return_value=(
                "# Stripe Atlas\n\n"
                "Incorporate your startup in Delaware and get ready to bank, fundraise, and accept payments."
            )
        ),
    ):
        result = await runtime.execute(
            _args({"action": "extract", "query": "What does this page say?"})
        )

    assert "Stripe Atlas" in result["output"]
    assert "extracted_content" not in result
    assert result["metadata"]["query"] == "What does this page say?"


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

    assert result["screenshot_path"] == str(Path("/tmp/browser-screenshot.png"))
    assert result["screenshot_content_type"] == "image/png"
    assert run_cli.await_args_list[-1].args == (
        "screenshot",
        str(Path("/tmp/browser-screenshot.png")),
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
async def test_shutdown_browser_runtime_closes_browser_use_and_dedicated_chrome() -> (
    None
):
    with (
        mock.patch.object(
            BrowserUseEngineRuntime,
            "_handle_close",
            new=mock.AsyncMock(return_value={"shutdown": True}),
        ) as close_session,
        mock.patch(
            "tools.browser.browser_use_engine.terminate_dedicated_chrome_with_cdp",
            new=mock.AsyncMock(return_value=2),
        ) as terminate_chrome,
    ):
        result = await shutdown_browser_runtime()

    close_session.assert_awaited_once_with(None)
    terminate_chrome.assert_awaited_once()
    assert result == {
        "browser_use_closed": True,
        "terminated_chrome_processes": 2,
        "errors": [],
    }


@pytest.mark.asyncio
async def test_click_requires_numeric_index_at_browser_use_boundary() -> None:
    runtime = BrowserUseEngineRuntime()
    args = SimpleNamespace(
        action="click",
        index=None,
        coordinate_x=None,
        coordinate_y=None,
        double_click=False,
        button="left",
    )

    with pytest.raises(BrowserActionError) as exc_info:
        await runtime.execute(args)

    assert exc_info.value.code == "INVALID_ARGUMENT"
    assert "numeric 'index'" in exc_info.value.message


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


@pytest.mark.asyncio
async def test_find_elements_returns_readable_output_and_structured_metadata() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(
            return_value={
                "result": [
                    {
                        "ordinal": 0,
                        "text": "Sign in",
                        "attributes": {"href": "https://dashboard.stripe.com/login"},
                    }
                ]
            }
        ),
    ) as run_cli:
        result = await runtime.execute(
            _args(
                {
                    "action": "find_elements",
                    "selector": "a",
                    "include_text": True,
                    "attributes": ["href"],
                    "max_results": 10,
                }
            )
        )

    assert run_cli.await_args.args[0] == "eval"
    assert result["elements"] == [
        {
            "ordinal": 0,
            "text": "Sign in",
            "attributes": {"href": "https://dashboard.stripe.com/login"},
        }
    ]
    assert "Found 1 element for selector 'a'" in result["output"]
    assert "Sign in" in result["output"]
    assert "index" not in result["elements"][0]


@pytest.mark.asyncio
async def test_switch_and_close_tab_use_numeric_tab_index() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={}),
    ) as run_cli:
        switch_result = await runtime.execute(
            _args({"action": "switch", "tab_index": 1})
        )
        close_result = await runtime.execute(
            _args({"action": "close_tab", "tab_index": 1})
        )

    assert run_cli.await_args_list == [
        mock.call("tab", "switch", "1"),
        mock.call("tab", "close", "1"),
    ]
    assert switch_result["tab_index"] == 1
    assert "target_id" not in switch_result
    assert close_result["closed_tab_index"] == 1
    assert "closed_target_id" not in close_result


@pytest.mark.asyncio
async def test_get_tabs_returns_canonical_tab_index_only() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(
            return_value={"_raw_text": "Tabs:\n0 https://example.com\n1 about:blank"}
        ),
    ):
        result = await runtime.execute(_args({"action": "get_tabs"}))

    assert result["tabs"] == [
        {"tab_index": 0, "title": "", "url": "https://example.com"},
        {"tab_index": 1, "title": "", "url": "about:blank"},
    ]


@pytest.mark.asyncio
async def test_hover_uses_browser_use_hover_command() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(return_value={"hovered": 17}),
    ) as run_cli:
        result = await runtime.execute(_args({"action": "hover", "index": 17}))

    run_cli.assert_awaited_once_with("hover", "17")
    assert result["hovered"] == 17
    assert result["output"] == "Hovered over element index 17."


@pytest.mark.asyncio
async def test_get_helpers_use_browser_use_get_commands() -> None:
    runtime = BrowserUseEngineRuntime()

    with mock.patch.object(
        runtime,
        "_run_cli",
        new=mock.AsyncMock(
            side_effect=[
                {"text": "Submit"},
                {"value": "Rocket Rides"},
                {"attributes": {"href": "https://example.com"}},
                {"bbox": {"x": 1, "y": 2, "width": 3, "height": 4}},
            ]
        ),
    ) as run_cli:
        text_result = await runtime.execute(_args({"action": "get_text", "index": 7}))
        value_result = await runtime.execute(_args({"action": "get_value", "index": 7}))
        attrs_result = await runtime.execute(
            _args({"action": "get_attributes", "index": 7})
        )
        bbox_result = await runtime.execute(_args({"action": "get_bbox", "index": 7}))

    assert run_cli.await_args_list == [
        mock.call("get", "text", "7"),
        mock.call("get", "value", "7"),
        mock.call("get", "attributes", "7"),
        mock.call("get", "bbox", "7"),
    ]
    assert text_result["output"] == "Text for element index 7: Submit"
    assert value_result["value"] == "Rocket Rides"
    assert attrs_result["attributes"] == {"href": "https://example.com"}
    assert bbox_result["bbox"] == {"x": 1, "y": 2, "width": 3, "height": 4}


@pytest.mark.asyncio
async def test_save_as_pdf_uses_browser_use_python_cdp_bridge() -> None:
    runtime = BrowserUseEngineRuntime()

    with (
        mock.patch.object(
            runtime,
            "_run_cli",
            new=mock.AsyncMock(
                return_value={
                    "_raw_text": (
                        '{"path": "/tmp/page.pdf", "bytes": 12, "file_name": "page.pdf"}\n'
                    )
                }
            ),
        ) as run_cli,
        mock.patch(
            "tools.browser.browser_use_engine.resolve_browser_path",
            return_value=Path("/tmp/page.pdf"),
        ),
    ):
        result = await runtime.execute(
            _args({"action": "save_as_pdf", "file_name": "page"})
        )

    assert run_cli.await_args.args[0] == "python"
    assert "Page.printToPDF" in run_cli.await_args.args[1]
    assert result == {
        "path": "/tmp/page.pdf",
        "file_name": "page.pdf",
        "bytes": 12,
        "output": "Saved current page as PDF to /tmp/page.pdf.",
        "success": True,
        "action": "save_as_pdf",
        "native_source": "browser_use.cli",
    }
