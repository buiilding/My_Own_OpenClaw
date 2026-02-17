"""Parity checks between Browser Use action registry and WindieOS browser."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import re
from types import SimpleNamespace
from unittest import mock

import pytest

from tools.browser.schemas import BROWSER_SCHEMAS
from tools.browser.browser_tool import BrowserUseCompatibilityAdapter
from tools.browser.browser_tool import (
    get_native_runtime_handlers,
)


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except Exception:
        return False


@lru_cache(maxsize=1)
def _browser_use_actions() -> set[str]:
    try:
        from browser_use.tools.service import Tools
    except Exception as exc:
        pytest.skip(f"browser_use import unavailable for parity checks: {exc}")
    return set(Tools().registry.registry.actions.keys())


@lru_cache(maxsize=1)
def _backend_browser_actions() -> set[str]:
    root = Path(__file__).resolve().parents[3]
    schema_path = root / "backend" / "src" / "tools" / "browser" / "schemas.py"
    text = schema_path.read_text(encoding="utf-8")
    match = re.search(
        r"class\s+BrowserControlArgs\(BaseModel\):.*?action:\s*Literal\[(.*?)\]\s*=\s*Field",
        text,
        re.S,
    )
    if not match:
        pytest.fail("Unable to parse backend BrowserControlArgs action literal")
    return set(re.findall(r'"([a-z_]+)"', match.group(1)))


def _minimal_action_args() -> dict[str, dict[str, object]]:
    return {
        "click": {"index": 1},
        "close": {"tab_id": "abcd"},
        "done": {"text": "done"},
        "dropdown_options": {"index": 1},
        "evaluate": {"code": "1 + 1"},
        "extract": {"query": "extract main points"},
        "find_elements": {"selector": "a"},
        "find_text": {"text": "example"},
        "go_back": {},
        "input": {"index": 1, "text": "value"},
        "navigate": {"url": "https://example.com"},
        "read_file": {"file_name": "notes.txt"},
        "read_long_content": {"goal": "summarize key details"},
        "replace_file": {
            "file_name": "notes.txt",
            "old_str": "old",
            "new_str": "new",
        },
        "screenshot": {},
        "scroll": {"pages": 1.0, "down": True},
        "search": {"query": "windie os"},
        "search_page": {"pattern": "windie"},
        "select_dropdown": {"index": 1, "text": "Option 1"},
        "send_keys": {"keys": "Enter"},
        "switch": {"tab_id": "abcd"},
        "upload_file": {"index": 1, "path": "/tmp/upload.txt"},
        "wait": {"seconds": 1},
        "write_file": {"file_name": "notes.txt", "content": "hello"},
    }


def test_browser_use_import_origin_is_vendored() -> None:
    import browser_use

    module_file = Path(getattr(browser_use, "__file__", "")).resolve()
    root = Path(__file__).resolve().parents[3]
    vendored_dir = root / "frontend" / "src" / "main" / "python" / "browser_use"
    assert vendored_dir.is_dir()
    assert _is_within(module_file, vendored_dir), (
        "browser_use import must resolve to vendored runtime "
        f"({vendored_dir}), got {module_file}"
    )


def test_sidecar_requirements_do_not_depend_on_browser_use_package() -> None:
    root = Path(__file__).resolve().parents[3]
    requirements_files = (
        root / "frontend" / "src" / "main" / "python" / "requirements.txt",
        root / "frontend" / "src" / "main" / "python" / "requirements.runtime.txt",
    )
    pattern = re.compile(r"^\s*browser-use([<>=!~].*)?$", re.MULTILINE)
    for req_file in requirements_files:
        text = req_file.read_text(encoding="utf-8")
        assert pattern.search(text) is None, (
            "browser-use pip package dependency must be absent in "
            f"{req_file}; Browser Use is vendored in-repo"
        )


def test_schema_exposes_all_browser_use_actions() -> None:
    browser_use_actions = _browser_use_actions()
    missing = sorted(browser_use_actions - set(BROWSER_SCHEMAS.keys()))
    assert missing == []


def test_backend_schema_exposes_all_browser_use_actions() -> None:
    browser_use_actions = _browser_use_actions()
    backend_actions = _backend_browser_actions()
    missing = sorted(browser_use_actions - backend_actions)
    assert missing == []


def test_native_handler_registry_covers_all_browser_use_actions() -> None:
    browser_use_actions = _browser_use_actions()
    handlers = get_native_runtime_handlers(
        controller=SimpleNamespace(
            is_connected=True,
            _mode="managed",
            _cdp_url=None,
        )
    )
    missing = sorted(browser_use_actions - set(handlers.keys()))
    assert missing == []


@pytest.mark.asyncio
async def test_adapter_dispatch_covers_all_browser_use_actions() -> None:
    browser_use_actions = _browser_use_actions()
    action_args = _minimal_action_args()
    missing_args = sorted(browser_use_actions - set(action_args.keys()))
    assert missing_args == []

    async def _execute_browser_use_action(
        *,
        action: str,
        params: dict[str, object],
    ) -> dict[str, object]:
        return {
            "success": True,
            "action": action,
            "params": dict(params),
            "native_source": "browser_use.tools",
        }

    runtime = SimpleNamespace(
        is_connected=True,
        execute_browser_use_action=mock.AsyncMock(
            side_effect=_execute_browser_use_action
        ),
        close=mock.AsyncMock(),
    )
    controller = SimpleNamespace(is_connected=True)
    adapter = BrowserUseCompatibilityAdapter(controller, runtime_provider=runtime)

    for action in sorted(browser_use_actions):
        args = {"action": action, **action_args[action]}
        result = await adapter.execute(action, args)
        assert result.success is True, f"{action}: {result.error}"

    dispatched_actions = {
        call.kwargs["action"]
        for call in runtime.execute_browser_use_action.await_args_list
    }
    assert dispatched_actions == browser_use_actions
