"""
Tests for backend browser remote tool.
"""

from unittest import mock

import pytest
from pydantic import ValidationError

from backend.src.tools.browser import RemoteBrowserTool
from backend.src.tools.browser.model_facing_schemas import (
    MODEL_FACING_BROWSER_ACTION_MODELS,
)
from backend.src.tools.browser.schemas import (
    BrowserClickArgs,
    BrowserControlArgs,
    BrowserEvaluateArgs,
    BrowserScreenshotArgs,
    BrowserSnapshotArgs,
)
from backend.src.tools.browser.openclaw_compat_schema import BrowserOpenClawCompatArgs
from backend.src.tools.remote import REMOTE_TOOLS, get_remote_tool


class TestRemoteBrowserTool:
    """Test RemoteBrowserTool."""

    def test_tool_name(self):
        """Test tool has correct name."""
        tool = RemoteBrowserTool()
        assert tool.name == "browser"

    def test_tool_category(self):
        """Test tool has correct category."""
        from backend.src.tools.categorization import ToolDomain

        tool = RemoteBrowserTool()
        assert tool.category == ToolDomain.BROWSER

    def test_tool_has_description(self):
        """Test tool has description."""
        tool = RemoteBrowserTool()
        assert len(tool.description) > 40
        assert "browser" in tool.description.lower()

    def test_tool_description_is_concise(self):
        """Tool description should stay concise; detailed strategy lives in prompt."""
        tool = RemoteBrowserTool()
        assert "screenshot" in tool.description.lower()
        assert "pagination" not in tool.description.lower()

    def test_args_model(self):
        """Test tool has correct args model."""
        tool = RemoteBrowserTool()
        assert tool.args_model == BrowserControlArgs

    def test_model_facing_schema_exposes_canonical_actions_only(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        one_of = schema["function"]["parameters"]["oneOf"]

        def _branch_action(branch: dict) -> str:
            action_schema = branch["properties"]["action"]
            enum_values = action_schema.get("enum")
            if isinstance(enum_values, list) and len(enum_values) == 1:
                return enum_values[0]
            return action_schema["const"]

        exposed_actions = {
            _branch_action(branch)
            for branch in one_of
            if isinstance(branch, dict)
        }

        assert "type" not in exposed_actions
        assert "open" not in exposed_actions
        assert "switch_tab" not in exposed_actions
        assert "press" not in exposed_actions
        assert "act" not in exposed_actions
        assert "write_file" not in exposed_actions
        assert "replace_file" not in exposed_actions
        assert "read_file" not in exposed_actions
        assert "navigate" in exposed_actions
        assert "input" in exposed_actions
        assert "send_keys" in exposed_actions

    def test_model_facing_schema_hides_camel_case_compat_fields(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        props: set[str] = set()
        for branch in schema["function"]["parameters"]["oneOf"]:
            props.update(branch.get("properties", {}).keys())

        assert "timeoutMs" not in props
        assert "promptText" not in props
        assert "colorScheme" not in props
        assert "targetId" not in props
        assert "targetUrl" not in props
        assert "inputRef" not in props
        assert "snapshotFormat" not in props
        assert "timeout_ms" not in props
        assert "prompt_text" not in props
        assert "color_scheme" not in props
        assert "mode" not in props
        assert "cdp_url" not in props
        assert "profile" not in props
        assert "node" not in props
        assert "target" not in props

    def test_model_facing_schema_uses_action_specific_one_of_contract(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        parameters = schema["function"]["parameters"]

        assert parameters["type"] == "object"
        assert parameters["additionalProperties"] is False
        assert "oneOf" in parameters
        assert len(parameters["oneOf"]) == len(MODEL_FACING_BROWSER_ACTION_MODELS)

    def test_model_facing_search_branch_requires_query(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        branch = next(
            branch
            for branch in schema["function"]["parameters"]["oneOf"]
            if branch["properties"]["action"].get("enum") == ["search"]
        )

        assert branch["required"] == ["action", "query"]
        assert "url" not in branch["properties"]
        assert branch["additionalProperties"] is False

    def test_model_facing_find_elements_branch_requires_selector(self):
        tool = RemoteBrowserTool()
        schema = tool.get_json_schema()
        branch = next(
            branch
            for branch in schema["function"]["parameters"]["oneOf"]
            if branch["properties"]["action"].get("enum") == ["find_elements"]
        )

        assert branch["required"] == ["action", "selector"]
        assert "description" not in branch["properties"]
        assert branch["additionalProperties"] is False

    @pytest.mark.asyncio
    async def test_execute_remote_returns_remote_result(self):
        """Test execute_remote returns RemoteToolResult."""
        tool = RemoteBrowserTool()

        # Mock context
        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "test-123"}

        args = BrowserControlArgs(action="connect", mode="user_chrome")
        result = await tool.execute_remote(args, mock_ctx)

        assert result.is_remote is True
        assert result.tool_name == "browser"
        assert result.args["action"] == "connect"

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_removed_type_alias_even_with_legacy_flags(
        self, monkeypatch, caplog
    ):
        monkeypatch.setenv("WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY", "1")
        monkeypatch.setenv("WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS", "1")
        tool = RemoteBrowserTool()
        caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "type-removed"}

        args = BrowserControlArgs(action="type", ref="1", text="hello")
        with pytest.raises(
            ValueError,
            match="Legacy browser action 'type' has been removed. Use input.",
        ):
            await tool.execute_remote(args, mock_ctx)

        assert (
            "Legacy browser action 'type' blocked by legacy_alias_removed; "
            "prefer 'input'"
        ) in caplog.text

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_removed_act_alias(self, caplog):
        tool = RemoteBrowserTool()
        caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "act-removed"}

        args = BrowserControlArgs(action="act")
        with pytest.raises(
            ValueError,
            match="Legacy browser action 'act' has been removed",
        ):
            await tool.execute_remote(args, mock_ctx)

        assert (
            "Legacy browser action 'act' blocked by legacy_alias_removed; "
            "prefer 'canonical actions directly'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'act' blocked by legacy_alias_removed" in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "act"
        assert getattr(record, "preferred_action", None) == "canonical actions directly"
        assert getattr(record, "legacy_action_blocked", None) is True
        assert getattr(record, "legacy_action_gate", None) == "legacy_alias_removed"

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_removed_open_alias(self, caplog):
        tool = RemoteBrowserTool()
        caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "open-removed"}

        args = BrowserControlArgs(action="open", url="https://example.com")
        with pytest.raises(
            ValueError,
            match="Legacy browser action 'open' has been removed. Use navigate.",
        ):
            await tool.execute_remote(args, mock_ctx)

        assert (
            "Legacy browser action 'open' blocked by legacy_alias_removed; "
            "prefer 'navigate'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'open' blocked by legacy_alias_removed" in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "open"
        assert getattr(record, "preferred_action", None) == "navigate"
        assert getattr(record, "legacy_action_blocked", None) is True
        assert getattr(record, "legacy_action_gate", None) == "legacy_alias_removed"

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_removed_switch_tab_alias(self, caplog):
        tool = RemoteBrowserTool()
        caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "switch-tab-removed"}

        args = BrowserControlArgs(action="switch_tab", target_id="abcd")
        with pytest.raises(
            ValueError,
            match="Legacy browser action 'switch_tab' has been removed. Use switch.",
        ):
            await tool.execute_remote(args, mock_ctx)

        assert (
            "Legacy browser action 'switch_tab' blocked by legacy_alias_removed; "
            "prefer 'switch'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'switch_tab' blocked by legacy_alias_removed"
            in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "switch_tab"
        assert getattr(record, "preferred_action", None) == "switch"
        assert getattr(record, "legacy_action_blocked", None) is True
        assert getattr(record, "legacy_action_gate", None) == "legacy_alias_removed"

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_removed_press_alias(self, caplog):
        tool = RemoteBrowserTool()
        caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "press-removed"}

        args = BrowserControlArgs(action="press", key="Enter")
        with pytest.raises(
            ValueError,
            match="Legacy browser action 'press' has been removed. Use send_keys.",
        ):
            await tool.execute_remote(args, mock_ctx)

        assert (
            "Legacy browser action 'press' blocked by legacy_alias_removed; "
            "prefer 'send_keys'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'press' blocked by legacy_alias_removed" in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "press"
        assert getattr(record, "preferred_action", None) == "send_keys"
        assert getattr(record, "legacy_action_blocked", None) is True
        assert getattr(record, "legacy_action_gate", None) == "legacy_alias_removed"

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

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_search_without_query(self):
        tool = RemoteBrowserTool()
        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "search-missing-query"}

        args = BrowserControlArgs(action="search", url="https://example.com/search?q=test")
        with pytest.raises(
            ValueError,
            match="Invalid browser arguments for action 'search': .*query.*Field required.*url.*Extra inputs are not permitted",
        ):
            await tool.execute_remote(args, mock_ctx)

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_find_elements_without_selector(self):
        tool = RemoteBrowserTool()
        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "find-elements-missing-selector"}

        args = BrowserControlArgs(action="find_elements", description="links on the page")
        with pytest.raises(
            ValueError,
            match="Invalid browser arguments for action 'find_elements': .*selector.*Field required.*description.*Extra inputs are not permitted",
        ):
            await tool.execute_remote(args, mock_ctx)


class TestBrowserToolRegistry:
    """Test browser tool in registry."""

    def test_browser_in_remote_tools(self):
        """Test browser is in REMOTE_TOOLS."""
        assert "browser" in REMOTE_TOOLS
        assert REMOTE_TOOLS["browser"] == RemoteBrowserTool

    def test_get_remote_tool_returns_browser_tool(self):
        """Test get_remote_tool returns browser tool."""
        tool_class = get_remote_tool("browser")
        assert tool_class == RemoteBrowserTool


class TestBrowserControlArgs:
    """Test BrowserControlArgs schema."""

    def test_connect_action(self):
        """Test connect action args."""
        args = BrowserControlArgs(action="connect", mode="user_chrome")
        assert args.action == "connect"
        assert args.mode == "user_chrome"

    def test_navigate_action(self):
        """Test navigate action args."""
        args = BrowserControlArgs(
            action="navigate",
            url="https://example.com",
        )
        assert args.action == "navigate"
        assert args.url == "https://example.com"

    def test_status_action(self):
        """Test OpenClaw-compatible status action args."""
        args = BrowserControlArgs(action="status")
        assert args.action == "status"

    def test_search_action(self):
        """Test Browser Use search action args."""
        args = BrowserControlArgs(action="search", query="pricing tiers")
        assert args.action == "search"
        assert args.query == "pricing tiers"

    def test_extract_action(self):
        """Test extract action args."""
        args = BrowserControlArgs(action="extract", query="collect pricing tiers")
        assert args.action == "extract"
        assert args.query == "collect pricing tiers"
        assert args.start_from_char == 0
        assert args.extract_links is False

    def test_click_action(self):
        """Test click action args."""
        args = BrowserControlArgs(action="click", ref="5")
        assert args.action == "click"
        assert args.ref == "5"

    def test_click_action_with_coordinates(self):
        """Test Browser Use coordinate click args."""
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

    def test_type_action(self):
        """Test removed type alias fields remain available for migration errors."""
        args = BrowserControlArgs(
            action="type",
            ref="3",
            text="Hello",
            submit=True,
        )
        assert args.action == "type"
        assert args.ref == "3"
        assert args.text == "Hello"
        assert args.submit is True

    def test_removed_type_alias_reports_input_preferred_action(self):
        args = BrowserControlArgs(action="type", ref="1", text="Hello")
        assert args.preferred_action == "input"

    def test_removed_act_alias_reports_canonical_preferred_action(self):
        args = BrowserControlArgs(action="act")
        assert args.preferred_action == "canonical actions directly"

    def test_removed_open_alias_reports_navigate_preferred_action(self):
        args = BrowserControlArgs(action="open")
        assert args.preferred_action == "navigate"

    def test_removed_switch_tab_alias_reports_switch_preferred_action(self):
        args = BrowserControlArgs(action="switch_tab")
        assert args.preferred_action == "switch"

    def test_removed_press_alias_reports_send_keys_preferred_action(self):
        args = BrowserControlArgs(action="press", key="Enter")
        assert args.preferred_action == "send_keys"

    def test_press_action_key_field(self):
        """Test removed press alias key field remains available for migration errors."""
        args = BrowserControlArgs(action="press", key="Enter")
        assert args.action == "press"
        assert args.key == "Enter"

    def test_screenshot_action_supports_file_name(self):
        """Test screenshot action keeps file_name support."""
        args = BrowserControlArgs(action="screenshot", file_name="capture.png")
        assert args.action == "screenshot"
        assert args.file_name == "capture.png"

    def test_screenshot_compatibility_fields_not_exposed_on_unified_schema(self):
        """Model-facing browser schema should not advertise deprecated screenshot args."""
        model_fields = BrowserControlArgs.model_fields
        assert "full_page" not in model_fields
        assert "element" not in model_fields
        assert "type" not in model_fields
        assert "quality" not in model_fields

    def test_evaluate_action_requires_script_or_code(self):
        with pytest.raises(
            ValidationError,
            match="evaluate requires either 'script' or 'code'",
        ):
            BrowserEvaluateArgs(action="evaluate")

    def test_default_values(self):
        """Test default values."""
        args = BrowserControlArgs(action="snapshot")
        assert args.format == "ai"
        assert args.max_chars is None
        assert args.button == "left"
        assert args.direction == "down"
        assert args.amount == 500

    def test_snapshot_scope_fields_accept_shared_values(self):
        """Test snapshot scope fields remain accepted on unified schema."""
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
        """Test Browser Use fractional scroll pages."""
        args = BrowserControlArgs(action="scroll", pages=0.5)
        assert args.pages == 0.5

    def test_openclaw_compat_args_still_available(self):
        """Test OpenClaw-specific schema model remains available after split."""
        args = BrowserOpenClawCompatArgs(action="status")
        assert args.action == "status"

    def test_shared_file_and_target_compat_fields_remain_available(self):
        """Shared compatibility fields should remain on BrowserControlArgs."""
        args = BrowserControlArgs(
            action="status",
            append=True,
            trailing_newline=False,
            old_str="a",
            new_str="b",
            target="host",
        )
        assert args.append is True
        assert args.trailing_newline is False
        assert args.old_str == "a"
        assert args.new_str == "b"
        assert args.target == "host"


class TestBrowserSnapshotArgs:
    """Test action-specific snapshot schema."""

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
    """OpenClaw schema compatibility checks."""

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
    """Browser screenshot schema checks."""

    def test_screenshot_schema_keeps_shared_image_defaults(self):
        args = BrowserScreenshotArgs(action="screenshot")
        assert args.action == "screenshot"
        assert args.element is None
        assert args.type == "png"
        assert args.quality is None
