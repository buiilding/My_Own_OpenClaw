"""Covers local-runtime browser schema contract behavior."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError
from windie_shared.browser_contract import (
    BROWSER_ACTION_CONTRACTS,
    BROWSER_CANONICAL_ACTIONS,
    BrowserConnectArgs,
    BrowserClickArgs,
    BrowserControlArgs,
    BrowserFindTextArgs,
    BrowserInputArgs,
    BrowserNavigateArgs,
    BrowserProfilesArgs,
    BrowserReplaceFileArgs,
    BrowserScrollArgs,
    BrowserSnapshotArgs,
    BrowserSwitchArgs,
    BrowserUploadFileArgs,
    BrowserWaitArgs,
)
from windie_shared.browser_contract import (
    build_browser_tool_parameters_schema,
)
from windie_shared.browser_contract_schema import _clean_schema

from tools.manifest import build_local_runtime_tool_manifest

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
LOCAL_RUNTIME_BROWSER_ADAPTER_ACTIONS = {
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
UNSUPPORTED_ACTION_SCHEMA_KEYS = {"$defs", "$ref", "allOf", "oneOf"}


def _contains_schema_key(node: object, key: str) -> bool:
    if isinstance(node, dict):
        return key in node or any(
            _contains_schema_key(value, key) for value in node.values()
        )
    if isinstance(node, list):
        return any(_contains_schema_key(value, key) for value in node)
    return False


def _collect_any_of_shapes(node: object) -> list[list[str | None]]:
    shapes: list[list[str | None]] = []
    if isinstance(node, dict):
        any_of = node.get("anyOf")
        if isinstance(any_of, list):
            shapes.append(
                [
                    item.get("type") if isinstance(item, dict) else None
                    for item in any_of
                ]
            )
        for value in node.values():
            shapes.extend(_collect_any_of_shapes(value))
    elif isinstance(node, list):
        for value in node:
            shapes.extend(_collect_any_of_shapes(value))
    return shapes


def test_local_runtime_browser_control_args_use_shared_grouped_schema() -> None:
    schema = build_browser_tool_parameters_schema()

    assert BrowserControlArgs.__module__.startswith("windie_shared.browser_contract")
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert "oneOf" not in schema
    assert "url" in schema["properties"]
    assert "text" in schema["properties"]


def test_browser_tool_descriptions_stay_product_neutral() -> None:
    manifest = build_local_runtime_tool_manifest({"browser"})
    [browser_tool] = manifest["tools"]

    assert browser_tool["description"] == (
        "Control the dedicated browser instance for navigation, extraction, page "
        "interaction, tab management, and screenshots."
    )
    assert "Windie" not in browser_tool["description"]
    assert BrowserConnectArgs.model_json_schema()["properties"]["action"][
        "description"
    ] == "Connect to the dedicated browser."
    assert BrowserProfilesArgs.model_json_schema()["properties"]["action"][
        "description"
    ] == "List available dedicated browser profiles."


def test_action_model_schemas_stay_flat_for_grouped_schema_builder() -> None:
    for contract in BROWSER_ACTION_CONTRACTS:
        raw_schema = contract.args_model.model_json_schema()
        for key in UNSUPPORTED_ACTION_SCHEMA_KEYS:
            assert not _contains_schema_key(raw_schema, key), contract.name


def test_action_model_any_of_shapes_are_nullable_only() -> None:
    for contract in BROWSER_ACTION_CONTRACTS:
        for shape in _collect_any_of_shapes(contract.args_model.model_json_schema()):
            assert len(shape) == 2, contract.name
            assert shape.count("null") == 1, contract.name


def test_schema_cleaner_rejects_non_nullable_any_of() -> None:
    with pytest.raises(ValueError, match="nullable anyOf"):
        _clean_schema(
            {
                "anyOf": [
                    {"type": "string"},
                    {"type": "integer"},
                ]
            }
        )


def test_grouped_schema_does_not_emit_unsupported_composition_keys() -> None:
    schema = build_browser_tool_parameters_schema()

    for key in UNSUPPORTED_ACTION_SCHEMA_KEYS:
        assert not _contains_schema_key(schema, key), key


def test_local_runtime_browser_action_contract_is_canonical_only() -> None:
    assert "open" not in BROWSER_CANONICAL_ACTIONS
    assert "type" not in BROWSER_CANONICAL_ACTIONS
    assert "switch_tab" not in BROWSER_CANONICAL_ACTIONS
    assert "dropdown_options" not in BROWSER_CANONICAL_ACTIONS
    assert "save_as_pdf" in BROWSER_CANONICAL_ACTIONS
    assert "hover" in BROWSER_CANONICAL_ACTIONS
    assert "get_text" in BROWSER_CANONICAL_ACTIONS


def test_browser_schema_reconciles_native_browser_use_surface() -> None:
    canonical_actions = set(BROWSER_CANONICAL_ACTIONS)

    assert NATIVE_BROWSER_USE_AGENT_ACTIONS - canonical_actions == {"dropdown_options"}
    assert LOCAL_RUNTIME_BROWSER_ADAPTER_ACTIONS.issubset(canonical_actions)
    assert "save_as_pdf" in canonical_actions
    assert "dropdown_options" not in canonical_actions


def test_snapshot_schema_is_strict() -> None:
    args = BrowserSnapshotArgs(action="snapshot", explanation=EXPLANATION)
    assert args.offset == 0
    assert args.limit == 4000

    with pytest.raises(ValidationError):
        BrowserSnapshotArgs(
            action="snapshot", mode="efficient", explanation=EXPLANATION
        )

    with pytest.raises(ValidationError):
        BrowserSnapshotArgs(action="snapshot", format="aria", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSnapshotArgs(
            action="snapshot",
            offset=119_999,
            limit=2,
            explanation=EXPLANATION,
        )


def test_navigate_and_wait_reject_removed_state_fields() -> None:
    navigate_args = BrowserNavigateArgs(
        action="navigate",
        url="https://example.com",
        explanation=EXPLANATION,
    )
    assert navigate_args.url == "https://example.com"

    wait_args = BrowserWaitArgs(action="wait", seconds=0.5, explanation=EXPLANATION)
    assert wait_args.seconds == 0.5

    with pytest.raises(ValidationError):
        BrowserNavigateArgs(
            action="navigate",
            url="https://example.com",
            wait_until="domcontentloaded",
            explanation=EXPLANATION,
        )

    with pytest.raises(ValidationError):
        BrowserNavigateArgs(
            action="navigate",
            url="https://example.com",
            waitUntil="domcontentloaded",
            explanation=EXPLANATION,
        )

    with pytest.raises(ValidationError):
        BrowserWaitArgs(
            action="wait", state="domcontentloaded", explanation=EXPLANATION
        )


def test_input_find_text_and_switch_use_canonical_fields_only() -> None:
    input_args = BrowserInputArgs(
        action="input", index=3, text="hello", explanation=EXPLANATION
    )
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

    switch_args = BrowserSwitchArgs(
        action="switch", tab_index=1, explanation=EXPLANATION
    )
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
        BrowserInputArgs(
            action="input",
            index=3,
            text="hello",
            clear_first=True,
            explanation=EXPLANATION,
        )

    with pytest.raises(ValidationError):
        BrowserInputArgs(
            action="input", index=3, text="hello", clear=True, explanation=EXPLANATION
        )

    with pytest.raises(ValidationError):
        BrowserInputArgs(
            action="input", index=3, text="hello", submit=True, explanation=EXPLANATION
        )

    with pytest.raises(ValidationError):
        BrowserControlArgs.model_validate(
            {
                "action": "input",
                "index": 3,
                "text": "hello",
                "submit": True,
                "explanation": EXPLANATION,
            }
        )

    with pytest.raises(ValidationError):
        BrowserFindTextArgs(
            action="find_text", pattern="pricing", explanation=EXPLANATION
        )

    with pytest.raises(ValidationError):
        BrowserFindTextArgs(
            action="find_text", text="pricing", max_results=0, explanation=EXPLANATION
        )

    with pytest.raises(ValidationError):
        BrowserSwitchArgs(action="switch", target_id="abcd", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSwitchArgs(action="switch", tab_id="abcd", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserSwitchArgs(action="switch", tab_index=-1, explanation=EXPLANATION)


def test_replace_file_uses_canonical_string_fields_only() -> None:
    args = BrowserReplaceFileArgs(
        action="replace_file",
        file_name="notes.txt",
        old_string="old",
        new_string="new",
        explanation=EXPLANATION,
    )
    assert args.old_string == "old"
    assert args.new_string == "new"

    with pytest.raises(ValidationError):
        BrowserReplaceFileArgs(
            action="replace_file",
            file_name="notes.txt",
            old_str="old",
            new_str="new",
            explanation=EXPLANATION,
        )

    with pytest.raises(ValidationError):
        BrowserControlArgs.model_validate(
            {
                "action": "replace_file",
                "file_name": "notes.txt",
                "old_str": "old",
                "new_str": "new",
                "explanation": EXPLANATION,
            }
        )


def test_element_actions_reject_legacy_ref_alias() -> None:
    with pytest.raises(ValidationError):
        BrowserInputArgs(action="input", ref="3", text="hello", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserClickArgs(action="click", ref="3", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserControlArgs.model_validate(
            {
                "action": "input",
                "ref": "3",
                "text": "hello",
                "explanation": EXPLANATION,
            }
        )


def test_scroll_uses_canonical_fields_only() -> None:
    args = BrowserScrollArgs(
        action="scroll", direction="up", amount=500, explanation=EXPLANATION
    )
    assert args.direction == "up"

    with pytest.raises(ValidationError):
        BrowserScrollArgs(action="scroll", down=True, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserScrollArgs(action="scroll", index=1, explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserControlArgs.model_validate(
            {"action": "scroll", "index": 1, "explanation": EXPLANATION}
        )


def test_click_requires_target() -> None:
    with pytest.raises(ValidationError):
        BrowserClickArgs(action="click", explanation=EXPLANATION)

    with pytest.raises(ValidationError):
        BrowserClickArgs(action="click", index=0, explanation=EXPLANATION)

    args = BrowserClickArgs(action="click", index=1, explanation=EXPLANATION)
    assert args.index == 1


def test_upload_file_requires_path_at_schema_boundary() -> None:
    with pytest.raises(ValidationError):
        BrowserUploadFileArgs(
            action="upload_file",
            index=1,
            path="",
            explanation=EXPLANATION,
        )


def test_schema_registry_and_validation_reject_removed_aliases() -> None:
    args = BrowserControlArgs.model_validate(
        {
            "action": "snapshot",
            "offset": 10,
            "limit": 20,
            "explanation": EXPLANATION,
        }
    )
    assert args.action == "snapshot"
    assert args.offset == 10

    with pytest.raises(ValidationError):
        BrowserControlArgs.model_validate(
            {"action": "snapshot", "mode": "efficient", "explanation": EXPLANATION}
        )

    with pytest.raises(ValidationError):
        BrowserControlArgs.model_validate(
            {"action": "switch_tab", "tab_id": "abcd", "explanation": EXPLANATION}
        )


def test_local_runtime_browser_modules_do_not_import_backend_package() -> None:
    browser_dir = (
        Path(__file__).resolve().parents[3]
        / "frontend"
        / "src"
        / "main"
        / "python"
        / "tools"
        / "browser"
    )
    for module_name in ("browser_tool.py", "browser_use_engine.py"):
        source = (browser_dir / module_name).read_text(encoding="utf-8")
        assert "backend" + ".src" not in source
