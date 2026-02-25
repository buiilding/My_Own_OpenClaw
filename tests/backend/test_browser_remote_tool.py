"""
Tests for backend browser remote tool.
"""

import pytest
from unittest import mock

from backend.src.tools.browser import RemoteBrowserTool
from backend.src.tools.browser.schemas import (
    BrowserControlArgs,
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
        assert len(tool.description) > 100
        assert "browser" in tool.description.lower()

    def test_args_model(self):
        """Test tool has correct args model."""
        tool = RemoteBrowserTool()
        assert tool.args_model == BrowserControlArgs

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
    async def test_execute_remote_rejects_legacy_actions_in_strict_mode(self, monkeypatch):
        """Strict canonical mode should reject legacy browser action aliases."""
        monkeypatch.setenv("WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY", "1")
        tool = RemoteBrowserTool()

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "strict-legacy"}

        args = BrowserControlArgs(action="type", ref="1", text="hello")
        with pytest.raises(
            ValueError,
            match="Legacy browser actions are disabled by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1",
        ):
            await tool.execute_remote(args, mock_ctx)

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_legacy_actions_when_legacy_disabled(self, monkeypatch):
        tool = RemoteBrowserTool()

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "legacy-disabled"}

        args = BrowserControlArgs(action="open", url="https://example.com")
        with pytest.raises(
            ValueError,
            match="Legacy browser actions are disabled by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1",
        ):
            await tool.execute_remote(args, mock_ctx)

    @pytest.mark.asyncio
    async def test_execute_remote_rejects_removed_act_alias_even_when_legacy_enabled(
        self, monkeypatch, caplog
    ):
        monkeypatch.setenv("WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS", "1")
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

        assert "Legacy browser action 'act' blocked by legacy_act_removed" in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'act' blocked by legacy_act_removed" in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "act"
        assert getattr(record, "preferred_action", None) is None
        assert getattr(record, "legacy_action_blocked", None) is True
        assert getattr(record, "legacy_action_gate", None) == "legacy_act_removed"

    @pytest.mark.asyncio
    async def test_execute_remote_logs_warning_for_blocked_legacy_action(self, caplog):
        tool = RemoteBrowserTool()
        caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "legacy-blocked"}

        args = BrowserControlArgs(action="open", url="https://example.com")
        with pytest.raises(
            ValueError,
            match="Legacy browser actions are disabled by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1",
        ):
            await tool.execute_remote(args, mock_ctx)

        assert (
            "Legacy browser action 'open' blocked by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1; "
            "prefer 'navigate'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'open' blocked by WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1"
            in rec.getMessage()
        )
        assert getattr(record, "legacy_action", None) == "open"
        assert getattr(record, "preferred_action", None) == "navigate"
        assert getattr(record, "legacy_action_blocked", None) is True
        assert getattr(record, "legacy_action_gate", None) == "WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS=1"

    @pytest.mark.asyncio
    async def test_execute_remote_strict_mode_overrides_legacy_allow_flag(self, monkeypatch):
        monkeypatch.setenv("WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY", "1")
        monkeypatch.setenv("WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS", "1")
        tool = RemoteBrowserTool()

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "strict-precedence"}

        args = BrowserControlArgs(action="open", url="https://example.com")
        with pytest.raises(
            ValueError,
            match="Legacy browser actions are disabled by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1",
        ):
            await tool.execute_remote(args, mock_ctx)

    @pytest.mark.asyncio
    async def test_execute_remote_strict_mode_logs_canonical_gate(self, monkeypatch, caplog):
        monkeypatch.setenv("WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY", "1")
        monkeypatch.setenv("WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS", "1")
        tool = RemoteBrowserTool()
        caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "strict-log"}

        args = BrowserControlArgs(action="open", url="https://example.com")
        with pytest.raises(
            ValueError,
            match="Legacy browser actions are disabled by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1",
        ):
            await tool.execute_remote(args, mock_ctx)

        assert (
            "Legacy browser action 'open' blocked by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1; "
            "prefer 'navigate'"
        ) in caplog.text
        record = next(
            rec
            for rec in caplog.records
            if "Legacy browser action 'open' blocked by WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1"
            in rec.getMessage()
        )
        assert getattr(record, "legacy_action_gate", None) == "WINDIE_BROWSER_CANONICAL_ACTIONS_ONLY=1"
        assert getattr(record, "legacy_action_blocked", None) is True

    @pytest.mark.asyncio
    async def test_execute_remote_legacy_disable_still_allows_canonical_actions(self, monkeypatch):
        monkeypatch.setenv("WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS", "0")
        tool = RemoteBrowserTool()

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "canonical-ok"}

        args = BrowserControlArgs(action="navigate", url="https://example.com")
        result = await tool.execute_remote(args, mock_ctx)
        assert result.is_remote is True
        assert result.args["action"] == "navigate"

    @pytest.mark.asyncio
    async def test_execute_remote_logs_warning_for_allowed_legacy_action(self, caplog):
        with mock.patch.dict(
            "os.environ",
            {"WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS": "1"},
            clear=False,
        ):
            tool = RemoteBrowserTool()
            caplog.set_level("WARNING", logger="backend.src.tools.remote_tools.browser")

            mock_ctx = mock.Mock()
            mock_ctx.session = mock.Mock()
            mock_ctx.session.metadata = {"request_id": "legacy-log"}

            args = BrowserControlArgs(action="open", url="https://example.com")
            result = await tool.execute_remote(args, mock_ctx)

            assert result.is_remote is True
            assert "Legacy browser action 'open' invoked; prefer 'navigate'" in caplog.text
            record = next(
                rec
                for rec in caplog.records
                if "Legacy browser action 'open' invoked; prefer 'navigate'" in rec.getMessage()
            )
            assert getattr(record, "legacy_action", None) == "open"
            assert getattr(record, "preferred_action", None) == "navigate"
            assert getattr(record, "legacy_action_blocked", None) is False
            assert getattr(record, "legacy_action_gate", None) is None

    @pytest.mark.asyncio
    async def test_execute_remote_legacy_allow_flag_enables_aliases(self, monkeypatch):
        monkeypatch.setenv("WINDIE_BROWSER_ALLOW_LEGACY_ACTIONS", "1")
        tool = RemoteBrowserTool()

        mock_ctx = mock.Mock()
        mock_ctx.session = mock.Mock()
        mock_ctx.session.metadata = {"request_id": "legacy-enabled"}

        args = BrowserControlArgs(action="open", url="https://example.com")
        result = await tool.execute_remote(args, mock_ctx)
        assert result.is_remote is True
        assert result.args["action"] == "open"


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

    def test_type_action(self):
        """Test type action args."""
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

    def test_legacy_action_helper_reports_preferred_action(self):
        args = BrowserControlArgs(action="press", key="Enter")
        assert args.is_legacy is True
        assert args.preferred_action == "send_keys"

    def test_removed_act_alias_reports_canonical_preferred_action(self):
        args = BrowserControlArgs(action="act")
        assert args.is_legacy is True
        assert args.preferred_action == "canonical actions directly"

    def test_press_action_key_field(self):
        """Test press action key field remains available."""
        args = BrowserControlArgs(action="press", key="Enter")
        assert args.action == "press"
        assert args.key == "Enter"

    def test_screenshot_action_supports_file_name(self):
        """Test screenshot action keeps file_name support."""
        args = BrowserControlArgs(action="screenshot", file_name="capture.png")
        assert args.action == "screenshot"
        assert args.file_name == "capture.png"

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


class TestBrowserScreenshotArgs:
    """Browser screenshot schema checks."""

    def test_screenshot_schema_keeps_shared_image_defaults(self):
        args = BrowserScreenshotArgs(action="screenshot")
        assert args.action == "screenshot"
        assert args.element is None
        assert args.type == "png"
        assert args.quality is None
