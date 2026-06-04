"""Sidecar tests for the shared strict browser schema contract."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.src.tools.browser.schemas import BrowserControlArgs as BackendBrowserControlArgs
from backend.src.tools.browser.schemas import build_browser_tool_parameters_schema
from windie_shared.browser_contract import (
    BROWSER_ACTIONS_REQUIRING_CONNECTION,
    BROWSER_CANONICAL_ACTIONS,
    BROWSER_RUNTIME_ACTIONS,
    BrowserClickArgs,
    BrowserControlArgs,
    BrowserFindTextArgs,
    BrowserInputArgs,
    BrowserScrollArgs,
    BrowserSnapshotArgs,
    BrowserSwitchArgs,
    build_browser_tool_parameters_schema as sidecar_build_browser_tool_parameters_schema,
    get_browser_schema,
    validate_browser_args,
)

EXPLANATION = "Advance the active user task."
NATIVE_BROWSER_USE_AGENT_ACTIONS = {
    "done",
    "search",
    "navigate",
    "go_back",
    "wait",
    "click",
    "input",
    "upload_file",
    "switch",
    "close",
    "extract",
    "search_page",
    "find_elements",
    "scroll",
    "send_keys",
    "find_text",
    "save_as_pdf",
    "dropdown_options",
    "select_dropdown",
    "write_file",
    "replace_file",
    "read_file",
    "evaluate",
}
WINDIE_BROWSER_LIFECYCLE_ACTIONS = {
    "connect",
    "status",
    "profiles",
    "snapshot",
    "get_tabs",
    "close_tab",
    "screenshot",
    "read_long_content",
    "hover",
    "get_text",
    "get_value",
    "get_attributes",
    "get_bbox",
}


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
    assert "open" not in BROWSER_CANONICAL_ACTIONS
    assert "type" not in BROWSER_CANONICAL_ACTIONS
    assert "switch_tab" not in BROWSER_CANONICAL_ACTIONS
    assert "dropdown_options" not in BROWSER_CANONICAL_ACTIONS
    assert "save_as_pdf" in BROWSER_CANONICAL_ACTIONS
    assert "hover" in BROWSER_CANONICAL_ACTIONS
    assert "get_text" in BROWSER_CANONICAL_ACTIONS
    assert BROWSER_RUNTIME_ACTIONS["close_tab"] == "close"
    assert "snapshot" in BROWSER_ACTIONS_REQUIRING_CONNECTION
    assert "connect" not in BROWSER_ACTIONS_REQUIRING_CONNECTION


def test_windie_browser_schema_reconciles_native_browser_use_surface() -> None:
    windie_actions = set(BROWSER_CANONICAL_ACTIONS)

    assert NATIVE_BROWSER_USE_AGENT_ACTIONS - windie_actions == {"dropdown_options"}
    assert WINDIE_BROWSER_LIFECYCLE_ACTIONS.issubset(windie_actions)
    assert "save_as_pdf" in windie_actions
    assert "dropdown_options" not in windie_actions


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
    assert input_args.text == "hello"

    find_text_args = BrowserFindTextArgs(
        action="find_text",
        text="pricing",
        css_scope="#search",
        max_results=5,
        explanation=EXPLANATION,
    )
    assert find_text_args.text == "pricing"
    assert find_text_args.css_scope == "#search"
    assert find_text_args.max_results == 5

    switch_args = BrowserSwitchArgs(action="switch", tab_index=1, explanation=EXPLANATION)
    assert switch_args.tab_index == 1
    assert switch_args.activate is True

    silent_switch_args = BrowserSwitchArgs(
        action="switch",
        tab_index=1,
        activate=False,
        explanation=EXPLANATION,
    )
    assert silent_switch_args.activate is False

    with pytest.raises(ValidationError):
        BrowserInputArgs(action="input", ref="3", text="hello", clear_first=True, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserInputArgs(action="input", ref="3", text="hello", clear=True, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserInputArgs(action="input", ref="3", text="hello", submit=True, explanation=EXPLANATION)

    valid, error = validate_browser_args(
        "input",
        {"ref": "3", "text": "hello", "submit": True, "explanation": EXPLANATION},
    )
    assert valid is False
    assert error is not None

    with pytest.raises(ValidationError):
        BrowserFindTextArgs(action="find_text", pattern="pricing", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserFindTextArgs(action="find_text", text="pricing", max_results=0, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSwitchArgs(action="switch", target_id="abcd", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSwitchArgs(action="switch", tab_id="abcd", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSwitchArgs(action="switch", tab_index=-1, explanation=EXPLANATION)


def test_scroll_uses_canonical_fields_only() -> None:
    args = BrowserScrollArgs(action="scroll", direction="up", amount=500, explanation=EXPLANATION)
    assert args.direction == "up"

    with pytest.raises(ValidationError):
        BrowserScrollArgs(action="scroll", down=True, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserScrollArgs(action="scroll", index=1, explanation=EXPLANATION)

    valid, error = validate_browser_args("scroll", {"index": 1, "explanation": EXPLANATION})
    assert valid is False
    assert error is not None


def test_click_requires_target() -> None:
    with pytest.raises(ValidationError):
        BrowserClickArgs(action="click", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserClickArgs(action="click", index=0, explanation=EXPLANATION)

    args = BrowserClickArgs(action="click", index=1, explanation=EXPLANATION)
    assert args.index == 1


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


def test_sidecar_browser_runtime_modules_do_not_import_backend_package() -> None:
    browser_dir = Path(__file__).resolve().parents[3] / "frontend" / "src" / "main" / "python" / "tools" / "browser"
    for module_name in ("browser_tool.py", "browser_use_engine.py"):
        source = (browser_dir / module_name).read_text(encoding="utf-8")
        assert "backend.src" not in source
