"""Sidecar tests for the shared strict browser schema contract."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.src.tools.browser.schemas import BrowserControlArgs as BackendBrowserControlArgs
from backend.src.tools.browser.schemas import build_browser_tool_parameters_schema
from tools.browser.browser_action_contract import (
    BROWSER_ACTIONS_REQUIRING_CONNECTION,
    BROWSER_ALL_ACTIONS,
    BROWSER_CANONICAL_ACTIONS,
    BROWSER_RUNTIME_ACTIONS,
)
from tools.browser.schemas import (
    BrowserClickArgs,
    BrowserControlArgs,
    BrowserFindTextArgs,
    BrowserInputArgs,
    BrowserSnapshotArgs,
    BrowserSwitchArgs,
    build_browser_tool_parameters_schema as sidecar_build_browser_tool_parameters_schema,
    get_browser_schema,
    validate_browser_args,
)

EXPLANATION = "Advance the active user task."


def test_sidecar_browser_control_args_reuses_backend_model() -> None:
    schema = sidecar_build_browser_tool_parameters_schema()

    assert BrowserControlArgs is BackendBrowserControlArgs
    assert schema == build_browser_tool_parameters_schema()
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert "oneOf" not in schema
    assert "url" in schema["properties"]
    assert "text" in schema["properties"]


def test_sidecar_action_contract_is_canonical_only() -> None:
    assert set(BROWSER_ALL_ACTIONS) == set(BROWSER_CANONICAL_ACTIONS)
    assert "open" not in BROWSER_ALL_ACTIONS
    assert "type" not in BROWSER_ALL_ACTIONS
    assert "switch_tab" not in BROWSER_ALL_ACTIONS
    assert BROWSER_RUNTIME_ACTIONS["close_tab"] == "close"
    assert "snapshot" in BROWSER_ACTIONS_REQUIRING_CONNECTION
    assert "connect" not in BROWSER_ACTIONS_REQUIRING_CONNECTION


def test_snapshot_schema_is_strict() -> None:
    args = BrowserSnapshotArgs(action="snapshot", explanation=EXPLANATION)
    assert args.offset == 0
    assert args.limit == 4000

    with pytest.raises(ValidationError):
        BrowserSnapshotArgs(action="snapshot", mode="efficient", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSnapshotArgs(action="snapshot", format="aria", explanation=EXPLANATION)


def test_input_find_text_and_switch_use_canonical_fields_only() -> None:
    input_args = BrowserInputArgs(action="input", ref="3", text="hello", explanation=EXPLANATION)
    assert input_args.clear is True

    find_text_args = BrowserFindTextArgs(action="find_text", text="pricing", explanation=EXPLANATION)
    assert find_text_args.text == "pricing"

    switch_args = BrowserSwitchArgs(action="switch", tab_id="abcd", explanation=EXPLANATION)
    assert switch_args.tab_id == "abcd"

    with pytest.raises(ValidationError):
        BrowserInputArgs(action="input", ref="3", text="hello", clear_first=True, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserFindTextArgs(action="find_text", pattern="pricing", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSwitchArgs(action="switch", target_id="abcd", explanation=EXPLANATION)


def test_click_requires_target() -> None:
    with pytest.raises(ValidationError):
        BrowserClickArgs(action="click", explanation=EXPLANATION)


def test_schema_registry_and_validation_reject_removed_aliases() -> None:
    assert get_browser_schema("switch") is BrowserSwitchArgs
    assert get_browser_schema("switch_tab") is None

    valid, error = validate_browser_args("snapshot", {"offset": 10, "limit": 20, "explanation": EXPLANATION})
    assert valid is True
    assert error is None

    valid, error = validate_browser_args("snapshot", {"mode": "efficient", "explanation": EXPLANATION})
    assert valid is False
    assert error is not None

    valid, error = validate_browser_args("switch_tab", {"tab_id": "abcd"})
    assert valid is False
    assert error == "Unknown browser action: switch_tab"


def test_sidecar_browser_modules_do_not_import_backend_package() -> None:
    browser_dir = Path(__file__).resolve().parents[3] / "frontend" / "src" / "main" / "python" / "tools" / "browser"
    for module_name in ("browser_action_contract.py", "schemas.py"):
        source = (browser_dir / module_name).read_text(encoding="utf-8")
        assert "backend.src" not in source
