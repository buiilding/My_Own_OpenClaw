"""Tests for the strict grouped browser tool contract."""

from __future__ import annotations

from unittest import mock

import pytest
from pydantic import ValidationError

from backend.src.tools.browser import RemoteBrowserTool
from backend.src.tools.browser.schema_types import BROWSER_CANONICAL_ACTIONS
from backend.src.tools.browser.schemas import (
    BrowserClickArgs,
    BrowserControlArgs,
    BrowserEvaluateArgs,
    BrowserExtractArgs,
    BrowserInputArgs,
    BrowserSnapshotArgs,
    BrowserSwitchArgs,
    build_browser_tool_parameters_schema,
    get_browser_schema,
)


class TestRemoteBrowserTool:
    def test_tool_registration_metadata(self) -> None:
        tool = RemoteBrowserTool()
        assert tool.name == "browser"
        assert tool.args_model is BrowserControlArgs
        assert "browser" in tool.description.lower()

    def test_model_facing_schema_is_grouped_root_object_contract(self) -> None:
        schema = RemoteBrowserTool().get_json_schema()
        parameters = schema["parameters"]

        assert parameters == build_browser_tool_parameters_schema()
        assert parameters["type"] == "object"
        assert parameters["required"] == ["action"]
        assert parameters["additionalProperties"] is False
        assert parameters["properties"]["action"]["enum"] == list(BROWSER_CANONICAL_ACTIONS)
        assert "oneOf" not in parameters
        assert "url" in parameters["properties"]
        assert "query" in parameters["properties"]
        assert "text" in parameters["properties"]

    def test_model_facing_schema_has_no_removed_or_cross_action_fields(self) -> None:
        schema = RemoteBrowserTool().get_json_schema()["parameters"]

        banned_fields = {
            "mode",
            "format",
            "snapshotFormat",
            "refs",
            "interactive",
            "compact",
            "depth",
            "frame",
            "target_id",
            "targetId",
            "target_url",
            "targetUrl",
            "input_ref",
            "inputRef",
            "clear_first",
            "script",
        }
        props = set(schema.get("properties", {}).keys())
        assert props.isdisjoint(banned_fields)

    def test_model_facing_schema_merges_shared_property_variants_without_root_union(self) -> None:
        schema = RemoteBrowserTool().get_json_schema()["parameters"]

        text_schema = schema["properties"]["text"]
        assert "anyOf" in text_schema
        assert "oneOf" not in schema

    @pytest.mark.asyncio
    async def test_execute_remote_serializes_canonical_payload(self) -> None:
        ctx = mock.Mock()
        ctx.session = mock.Mock()
        ctx.session.metadata = {"request_id": "browser-123"}

        result = await RemoteBrowserTool().execute_remote(
            BrowserControlArgs.model_validate(
                {"action": "navigate", "url": "https://example.com", "new_tab": True}
            ),
            ctx,
        )

        assert result.is_remote is True
        assert result.tool_name == "browser"
        assert result.request_id == "browser-123"
        assert result.args == {
            "action": "navigate",
            "url": "https://example.com",
            "new_tab": True,
        }


class TestBrowserControlArgs:
    def test_snapshot_defaults_and_window_bounds(self) -> None:
        args = BrowserControlArgs.model_validate({"action": "snapshot"})

        assert args.action == "snapshot"
        assert args.offset == 0
        assert args.limit == 4000
        assert args.include_screenshot is False

        with pytest.raises(ValidationError, match="maximum snapshot window"):
            BrowserSnapshotArgs(action="snapshot", offset=119_500, limit=1_000)

    def test_extract_keeps_only_canonical_fields(self) -> None:
        args = BrowserControlArgs.model_validate(
            {"action": "extract", "query": "pricing tiers"}
        )
        assert args.model_dump() == {
            "action": "extract",
            "query": "pricing tiers",
            "extract_links": False,
            "start_from_char": 0,
            "output_schema": None,
        }

    def test_removed_compatibility_fields_fail_validation(self) -> None:
        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "snapshot", "mode": "efficient"})

        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "snapshot", "format": "aria"})

        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "extract", "selector": "table"})

        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate(
                {"action": "extract", "wait_until": "networkidle"}
            )

    def test_removed_alias_actions_are_not_valid(self) -> None:
        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "open", "url": "https://example.com"})

        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "type", "ref": "1", "text": "hello"})

        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "press", "keys": "Enter"})

        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "switch_tab", "tab_id": "tab-1"})

    def test_click_requires_ref_index_or_coordinates(self) -> None:
        with pytest.raises(
            ValidationError,
            match="click requires either 'ref'/'index' or both 'coordinate_x' and 'coordinate_y'",
        ):
            BrowserClickArgs(action="click")

    def test_input_and_switch_are_strict(self) -> None:
        args = BrowserInputArgs(action="input", ref="5", text="hello")
        assert args.clear is True
        assert args.submit is False

        with pytest.raises(ValidationError):
            BrowserInputArgs(action="input", text="hello")

        switch_args = BrowserSwitchArgs(action="switch", tab_id="abcd")
        assert switch_args.tab_id == "abcd"

    def test_evaluate_requires_code_only(self) -> None:
        with pytest.raises(ValidationError):
            BrowserEvaluateArgs(action="evaluate")

        with pytest.raises(ValidationError):
            BrowserControlArgs.model_validate({"action": "evaluate", "script": "1 + 1"})

        args = BrowserEvaluateArgs(action="evaluate", code="1 + 1")
        assert args.code == "1 + 1"

    def test_schema_registry_only_knows_canonical_actions(self) -> None:
        assert get_browser_schema("snapshot") is BrowserSnapshotArgs
        assert get_browser_schema("extract") is BrowserExtractArgs
        assert get_browser_schema("switch") is BrowserSwitchArgs
        assert get_browser_schema("switch_tab") is None
