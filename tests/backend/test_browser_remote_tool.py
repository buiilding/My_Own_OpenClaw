"""Tests for backend browser remote tool and canonical browser contract."""

from unittest import mock

import pytest
from pydantic import ValidationError

from backend.src.tools.browser import RemoteBrowserTool
from backend.src.tools.browser.openclaw_compat_schema import BrowserOpenClawCompatArgs
from backend.src.tools.browser.schema_types import BROWSER_CANONICAL_ACTIONS
from backend.src.tools.browser.schemas import (
    BrowserClickArgs,
    BrowserControlArgs,
    BrowserEvaluateArgs,
    BrowserScreenshotArgs,
    BrowserSnapshotArgs,
)
from backend.src.tools.remote import REMOTE_TOOLS, get_remote_tool


class TestRemoteBrowserTool:
    def test_tool_name(self):
        tool = RemoteBrowserTool()
        assert tool.name == "browser"

    def test_tool_category(self):
        from backend.src.tools.categorization import ToolDomain

        tool = RemoteBrowserTool()
        assert tool.category == ToolDomain.BROWSER

    def test_tool_has_description(self):
        tool = RemoteBrowserTool()
        assert len(tool.description) > 40
        assert "browser" in tool.description.lower()

    def test_tool_description_is_concise(self):
        tool = RemoteBrowserTool()
        assert "screenshot" in tool.description.lower()
        assert "pagination" not in tool.description.lower()

    def test_args_model(self):
        tool = RemoteBrowserTool()
        assert tool.args_model == BrowserControlArgs

    def test_model_facing_schema_uses_canonical_generic_path(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()

        assert schema["type"] == "function"
        assert schema["name"] == "browser"
        assert schema["description"] == tool.description
        assert "function" not in schema

    def test_model_facing_schema_exposes_canonical_actions_only(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        action_schema = schema["parameters"]["properties"]["action"]

        assert set(action_schema["enum"]) == set(BROWSER_CANONICAL_ACTIONS)
        assert "type" not in action_schema["enum"]
        assert "open" not in action_schema["enum"]
        assert "switch_tab" not in action_schema["enum"]
        assert "press" not in action_schema["enum"]
        assert "act" not in action_schema["enum"]
        assert "write_file" in action_schema["enum"]
        assert "replace_file" in action_schema["enum"]
        assert "read_file" in action_schema["enum"]

    def test_model_facing_schema_exposes_only_canonical_fields(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        props = schema["parameters"]["properties"]

        assert "timeoutMs" not in props
        assert "timeout_ms" not in props
        assert "promptText" not in props
        assert "prompt_text" not in props
        assert "colorScheme" not in props
        assert "color_scheme" not in props
        assert "targetId" not in props
        assert "targetUrl" not in props
        assert "inputRef" not in props
        assert "snapshotFormat" not in props
        assert "cdp_url" not in props
        assert "profile" not in props
        assert "node" not in props
        assert "target" not in props
        assert "value" not in props
        assert "mode" in props
        assert "content" in props
        assert "path" in props
        assert "target_id" in props
        assert "input_ref" in props

    def test_model_facing_schema_uses_args_model_descriptions_directly(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        props = schema["parameters"]["properties"]

        assert props["text"]["description"] == BrowserControlArgs.model_fields["text"].description

    @pytest.mark.asyncio
    async def test_execute_remote_returns_remote_result(self):
        tool = RemoteBrowserTool()
        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "test-123"}

        args = BrowserControlArgs(action="connect")
        result = await tool.execute_remote(args, mock_ctx)

        assert result.is_remote is True
        assert result.tool_name == "browser"
        assert result.args["action"] == "connect"

    @pytest.mark.asyncio
    async def test_execute_remote_allows_canonical_actions(self):
        tool = RemoteBrowserTool()
        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "canonical-ok"}

        args = BrowserControlArgs(action="navigate", url="https://example.com")
        result = await tool.execute_remote(args, mock_ctx)

        assert result.is_remote is True
        assert result.args["action"] == "navigate"


class TestBrowserToolRegistry:
    def test_browser_in_remote_tools(self):
        assert "browser" in REMOTE_TOOLS
        assert REMOTE_TOOLS["browser"] == RemoteBrowserTool

    def test_get_remote_tool_returns_browser_tool(self):
        tool_class = get_remote_tool("browser")
        assert tool_class == RemoteBrowserTool


class TestBrowserControlArgs:
    def test_connect_action(self):
        args = BrowserControlArgs(action="connect")
        assert args.action == "connect"

    def test_navigate_action(self):
        args = BrowserControlArgs(action="navigate", url="https://example.com")
        assert args.action == "navigate"
        assert args.url == "https://example.com"

    def test_status_action(self):
        args = BrowserControlArgs(action="status")
        assert args.action == "status"

    def test_search_action(self):
        args = BrowserControlArgs(action="search", query="pricing tiers")
        assert args.action == "search"
        assert args.query == "pricing tiers"

    def test_extract_action(self):
        args = BrowserControlArgs(
            action="extract",
            mode="focused",
            query="collect pricing tiers",
        )
        assert args.action == "extract"
        assert args.mode == "focused"
        assert args.query == "collect pricing tiers"
        assert args.start_from_char == 0
        assert args.extract_links is False

    def test_click_action(self):
        args = BrowserControlArgs(action="click", ref="5")
        assert args.action == "click"
        assert args.ref == "5"

    def test_click_action_with_coordinates(self):
        args = BrowserControlArgs(action="click", coordinate_x=100, coordinate_y=250)
        assert args.action == "click"
        assert args.coordinate_x == 100
        assert args.coordinate_y == 250

    def test_click_action_requires_ref_index_or_coordinates(self):
        with pytest.raises(
            ValidationError,
            match="click requires either 'ref'/'index' or both 'coordinate_x' and 'coordinate_y'",
        ):
            BrowserClickArgs(action="click")

    def test_click_action_requires_both_coordinate_axes(self):
        with pytest.raises(
            ValidationError,
            match="click requires both 'coordinate_x' and 'coordinate_y' when using coordinate click",
        ):
            BrowserClickArgs(action="click", ref="5", coordinate_x=100)

    def test_removed_type_alias_is_rejected_during_validation(self):
        with pytest.raises(
            ValidationError,
            match="Legacy browser action 'type' has been removed. Use input.",
        ):
            BrowserControlArgs(action="type", ref="3", text="Hello", submit=True)

    def test_removed_open_alias_is_rejected_during_validation(self):
        with pytest.raises(
            ValidationError,
            match="Legacy browser action 'open' has been removed. Use navigate.",
        ):
            BrowserControlArgs(action="open", url="https://example.com")

    def test_removed_switch_tab_alias_is_rejected_during_validation(self):
        with pytest.raises(
            ValidationError,
            match="Legacy browser action 'switch_tab' has been removed. Use switch.",
        ):
            BrowserControlArgs(action="switch_tab", target_id="tab-1")

    def test_removed_press_alias_is_rejected_during_validation(self):
        with pytest.raises(
            ValidationError,
            match="Legacy browser action 'press' has been removed. Use send_keys.",
        ):
            BrowserControlArgs(action="press", key="Enter")

    def test_removed_act_alias_is_rejected_during_validation(self):
        with pytest.raises(
            ValidationError,
            match="Legacy browser action 'act' has been removed. Use canonical actions directly.",
        ):
            BrowserControlArgs(action="act")

    def test_screenshot_action_supports_file_name(self):
        args = BrowserControlArgs(action="screenshot", file_name="capture.png")
        assert args.action == "screenshot"
        assert args.file_name == "capture.png"

    def test_file_actions_keep_canonical_fields(self):
        args = BrowserControlArgs(
            action="write_file",
            path="/tmp/example.txt",
            content="hello",
            append=True,
        )
        assert args.path == "/tmp/example.txt"
        assert args.content == "hello"
        assert args.append is True

    def test_compatibility_fields_are_not_exposed_on_unified_schema(self):
        model_fields = BrowserControlArgs.model_fields

        assert "full_page" not in model_fields
        assert "element" not in model_fields
        assert "type" not in model_fields
        assert "quality" not in model_fields
        assert "timeoutMs" not in model_fields
        assert "targetId" not in model_fields
        assert "inputRef" not in model_fields

    def test_evaluate_action_requires_script_or_code(self):
        with pytest.raises(
            ValidationError,
            match="evaluate requires either 'script' or 'code'",
        ):
            BrowserEvaluateArgs(action="evaluate")

    def test_default_values(self):
        args = BrowserControlArgs(action="snapshot")
        assert args.format == "ai"
        assert args.max_chars is None
        assert args.button == "left"
        assert args.direction == "down"
        assert args.amount == 500

    def test_snapshot_scope_fields_accept_shared_values(self):
        args = BrowserControlArgs(
            action="snapshot",
            refs="role",
            interactive=True,
            compact=True,
            depth=2,
            selector="#main",
            frame="iframe#app",
        )
        assert args.refs == "role"
        assert args.interactive is True
        assert args.compact is True
        assert args.depth == 2
        assert args.selector == "#main"
        assert args.frame == "iframe#app"

    def test_scroll_action_with_fractional_pages(self):
        args = BrowserControlArgs(action="scroll", pages=0.5)
        assert args.pages == 0.5

    def test_openclaw_compat_args_still_available(self):
        args = BrowserOpenClawCompatArgs(action="status")
        assert args.action == "status"


class TestBrowserSnapshotArgs:
    def test_snapshot_scope_fields_accept_shared_values(self):
        args = BrowserSnapshotArgs(
            action="snapshot",
            refs="aria",
            interactive=False,
            compact=False,
            depth=1,
            selector=".content",
            frame="iframe[data-id='1']",
        )
        assert args.refs == "aria"
        assert args.interactive is False
        assert args.compact is False
        assert args.depth == 1
        assert args.selector == ".content"
        assert args.frame == "iframe[data-id='1']"


class TestOpenClawCompatArgs:
    def test_act_request_field_removed_from_openclaw_schema(self):
        assert "request" not in BrowserOpenClawCompatArgs.model_fields

    def test_shared_file_and_target_compat_fields_remain_available(self):
        args = BrowserOpenClawCompatArgs(
            action="status",
            append=True,
            trailing_newline=True,
            target="sandbox",
        )
        assert args.append is True
        assert args.trailing_newline is True
        assert args.target == "sandbox"

    def test_removed_act_alias_is_not_valid_openclaw_action(self):
        with pytest.raises(ValidationError, match="action"):
            BrowserOpenClawCompatArgs(action="act")

    def test_removed_type_alias_is_not_valid_openclaw_action(self):
        with pytest.raises(ValidationError, match="action"):
            BrowserOpenClawCompatArgs(action="type")

    def test_legacy_open_alias_is_not_valid_openclaw_action(self):
        with pytest.raises(ValidationError, match="action"):
            BrowserOpenClawCompatArgs(action="open")

    def test_legacy_switch_tab_alias_is_not_valid_openclaw_action(self):
        with pytest.raises(ValidationError, match="action"):
            BrowserOpenClawCompatArgs(action="switch_tab")


class TestBrowserScreenshotArgs:
    def test_screenshot_schema_keeps_shared_image_defaults(self):
        args = BrowserScreenshotArgs(action="screenshot")
        assert args.action == "screenshot"
        assert args.element is None
        assert args.type == "png"
        assert args.quality is None
