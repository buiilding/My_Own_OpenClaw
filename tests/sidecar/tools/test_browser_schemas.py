"""
Tests for browser tool schemas.
"""

import pytest
from pydantic import ValidationError

from tools.browser.schemas import (
    BrowserConnectArgs,
    BrowserNavigateArgs,
    BrowserSnapshotArgs,
    BrowserExtractArgs,
    BrowserClickArgs,
    BrowserTypeArgs,
    BrowserPressArgs,
    BrowserScrollArgs,
    BrowserScreenshotArgs,
    BrowserWaitArgs,
    BrowserGetTabsArgs,
    BrowserSwitchTabArgs,
    BrowserEvaluateArgs,
    BrowserCloseArgs,
    OPENCLAW_COMPAT_ACTIONS,
    get_browser_schema,
    validate_browser_args,
)


class TestBrowserConnectArgs:
    """Test BrowserConnectArgs schema."""

    def test_valid_user_chrome(self):
        """Test valid user Chrome connect args."""
        args = BrowserConnectArgs(
            action="connect",
            mode="user_chrome",
            cdp_url="http://127.0.0.1:9222",
        )
        assert args.mode == "user_chrome"
        assert args.cdp_url == "http://127.0.0.1:9222"

    def test_valid_managed(self):
        """Test valid managed browser args."""
        args = BrowserConnectArgs(
            action="connect",
            mode="managed",
            headless=True,
        )
        assert args.mode == "managed"
        assert args.headless is True

    def test_invalid_cdp_url_non_localhost(self):
        """Test that non-localhost CDP URL is rejected."""
        with pytest.raises(ValidationError, match="localhost"):
            BrowserConnectArgs(
                action="connect",
                mode="user_chrome",
                cdp_url="http://example.com:9222",
            )

    def test_valid_localhost_variations(self):
        """Test various localhost formats are accepted."""
        for url in ["http://localhost:9222", "http://127.0.0.1:9222"]:
            args = BrowserConnectArgs(
                action="connect",
                mode="user_chrome",
                cdp_url=url,
            )
            assert args.cdp_url == url


class TestBrowserNavigateArgs:
    """Test BrowserNavigateArgs schema."""

    def test_valid_navigate(self):
        """Test valid navigate args."""
        args = BrowserNavigateArgs(
            action="navigate",
            url="https://example.com",
        )
        assert args.url == "https://example.com"
        assert args.wait_until == "load"

    def test_valid_with_wait_until(self):
        """Test navigate with custom wait_until."""
        args = BrowserNavigateArgs(
            action="navigate",
            url="https://example.com",
            wait_until="load",
        )
        assert args.wait_until == "load"


class TestBrowserSnapshotArgs:
    """Test BrowserSnapshotArgs schema."""

    def test_valid_ai_snapshot(self):
        """Test valid AI snapshot args."""
        args = BrowserSnapshotArgs(action="snapshot")
        assert args.format == "ai"
        assert args.wait_until == "load"
        assert args.max_chars is None

    def test_valid_aria_snapshot(self):
        """Test valid ARIA snapshot args."""
        args = BrowserSnapshotArgs(
            action="snapshot",
            format="aria",
        )
        assert args.format == "aria"

    def test_valid_snapshot_wait_until(self):
        """Test snapshot with custom wait_until."""
        args = BrowserSnapshotArgs(
            action="snapshot",
            wait_until="networkidle",
        )
        assert args.wait_until == "networkidle"

    def test_valid_efficient_snapshot_mode(self):
        """Test valid efficient snapshot mode args."""
        args = BrowserSnapshotArgs(
            action="snapshot",
            mode="efficient",
        )
        assert args.mode == "efficient"

    def test_max_chars_bounds(self):
        """Test max_chars validation."""
        # Too low
        with pytest.raises(ValidationError):
            BrowserSnapshotArgs(action="snapshot", max_chars=50)

        # Too high
        with pytest.raises(ValidationError):
            BrowserSnapshotArgs(action="snapshot", max_chars=200000)

        # Valid
        args = BrowserSnapshotArgs(action="snapshot", max_chars=10000)
        assert args.max_chars == 10000

    def test_snapshot_offset_and_limit_bounds(self):
        """Test snapshot pagination args validation."""
        args = BrowserSnapshotArgs(action="snapshot", offset=0, limit=4000)
        assert args.offset == 0
        assert args.limit == 4000

        with pytest.raises(ValidationError):
            BrowserSnapshotArgs(action="snapshot", offset=-1)

        with pytest.raises(ValidationError):
            BrowserSnapshotArgs(action="snapshot", limit=0)


class TestBrowserExtractArgs:
    """Test BrowserExtractArgs schema."""

    def test_valid_extract(self):
        """Test valid extract args."""
        args = BrowserExtractArgs(action="extract", query="find pricing tiers")
        assert args.action == "extract"
        assert args.query == "find pricing tiers"
        assert args.mode == "focused"
        assert args.extract_links is False
        assert args.start_from_char == 0

    def test_valid_extract_structured_mode(self):
        """Test structured extract mode with selector scope."""
        args = BrowserExtractArgs(
            action="extract",
            query="api keys",
            mode="structured",
            selector="table.wikitable",
            frame="#main-frame",
        )
        assert args.mode == "structured"
        assert args.selector == "table.wikitable"
        assert args.frame == "#main-frame"

    def test_extract_bounds(self):
        """Test extract argument bounds."""
        with pytest.raises(ValidationError):
            BrowserExtractArgs(action="extract", query="")

        with pytest.raises(ValidationError):
            BrowserExtractArgs(action="extract", query="ok", start_from_char=-1)

        with pytest.raises(ValidationError):
            BrowserExtractArgs(action="extract", query="ok", max_chars=50)

        with pytest.raises(ValidationError):
            BrowserExtractArgs(action="extract", query="ok", mode="invalid")


class TestBrowserClickArgs:
    """Test BrowserClickArgs schema."""

    def test_valid_click(self):
        """Test valid click args."""
        args = BrowserClickArgs(
            action="click",
            ref="5",
        )
        assert args.ref == "5"
        assert args.button == "left"
        assert args.double_click is False

    def test_double_click(self):
        """Test double click args."""
        args = BrowserClickArgs(
            action="click",
            ref="5",
            double_click=True,
        )
        assert args.double_click is True

    def test_right_click(self):
        """Test right click args."""
        args = BrowserClickArgs(
            action="click",
            ref="5",
            button="right",
        )
        assert args.button == "right"

    def test_coordinate_click(self):
        """Test Browser Use coordinate click args."""
        args = BrowserClickArgs(
            action="click",
            coordinate_x=120,
            coordinate_y=340,
        )
        assert args.coordinate_x == 120
        assert args.coordinate_y == 340

    def test_coordinate_click_requires_pair(self):
        """Test coordinate click requires both coordinates."""
        with pytest.raises(ValidationError):
            BrowserClickArgs(
                action="click",
                coordinate_x=120,
            )


class TestBrowserTypeArgs:
    """Test BrowserTypeArgs schema."""

    def test_valid_type(self):
        """Test valid type args."""
        args = BrowserTypeArgs(
            action="type",
            ref="3",
            text="Hello World",
        )
        assert args.ref == "3"
        assert args.text == "Hello World"
        assert args.submit is False

    def test_type_with_submit(self):
        """Test type with submit."""
        args = BrowserTypeArgs(
            action="type",
            ref="3",
            text="Hello",
            submit=True,
        )
        assert args.submit is True

    def test_text_too_long(self):
        """Test text length validation."""
        with pytest.raises(ValidationError):
            BrowserTypeArgs(
                action="type",
                ref="3",
                text="x" * 15000,
            )


class TestBrowserPressArgs:
    """Test BrowserPressArgs schema."""

    def test_valid_press(self):
        """Test valid key press args."""
        args = BrowserPressArgs(
            action="press",
            key="Enter",
        )
        assert args.key == "Enter"


class TestBrowserScrollArgs:
    """Test BrowserScrollArgs schema."""

    def test_valid_scroll(self):
        """Test valid scroll args."""
        args = BrowserScrollArgs(action="scroll")
        assert args.direction == "down"
        assert args.amount == 500

    def test_scroll_up(self):
        """Test scroll up."""
        args = BrowserScrollArgs(
            action="scroll",
            direction="up",
            amount=1000,
        )
        assert args.direction == "up"
        assert args.amount == 1000

    def test_scroll_amount_bounds(self):
        """Test scroll amount validation."""
        # Too low
        with pytest.raises(ValidationError):
            BrowserScrollArgs(action="scroll", amount=50)

        # Too high
        with pytest.raises(ValidationError):
            BrowserScrollArgs(action="scroll", amount=10000)

    def test_scroll_supports_fractional_pages(self):
        """Test Browser Use fractional page scrolling support."""
        args = BrowserScrollArgs(action="scroll", pages=0.5)
        assert args.pages == 0.5


class TestBrowserScreenshotArgs:
    """Test BrowserScreenshotArgs schema."""

    def test_valid_screenshot(self):
        """Test valid screenshot args."""
        args = BrowserScreenshotArgs(action="screenshot")
        assert args.full_page is False
        assert args.ref is None

    def test_full_page_screenshot(self):
        """Test full page screenshot."""
        args = BrowserScreenshotArgs(
            action="screenshot",
            full_page=True,
        )
        assert args.full_page is True

    def test_element_screenshot(self):
        """Test element screenshot."""
        args = BrowserScreenshotArgs(
            action="screenshot",
            ref="5",
        )
        assert args.ref == "5"

    def test_jpeg_screenshot(self):
        """Test jpeg screenshot args."""
        args = BrowserScreenshotArgs(
            action="screenshot",
            type="jpeg",
            quality=80,
        )
        assert args.type == "jpeg"
        assert args.quality == 80


class TestBrowserWaitArgs:
    """Test BrowserWaitArgs schema."""

    def test_valid_wait(self):
        """Test valid wait args."""
        args = BrowserWaitArgs(action="wait")
        assert args.state == "networkidle"

    def test_wait_seconds(self):
        """Test wait with seconds."""
        args = BrowserWaitArgs(
            action="wait",
            seconds=5.0,
        )
        assert args.seconds == 5.0

    def test_wait_seconds_bounds(self):
        """Test wait seconds validation."""
        # Negative
        with pytest.raises(ValidationError):
            BrowserWaitArgs(action="wait", seconds=-1)

        # Too high
        with pytest.raises(ValidationError):
            BrowserWaitArgs(action="wait", seconds=120)


class TestBrowserGetTabsArgs:
    """Test BrowserGetTabsArgs schema."""

    def test_valid_get_tabs(self):
        """Test valid get_tabs args."""
        args = BrowserGetTabsArgs(action="get_tabs")
        assert args.action == "get_tabs"


class TestBrowserSwitchTabArgs:
    """Test BrowserSwitchTabArgs schema."""

    def test_valid_switch_tab(self):
        """Test valid switch_tab args."""
        args = BrowserSwitchTabArgs(
            action="switch_tab",
            target_id="abc123",
        )
        assert args.target_id == "abc123"


class TestBrowserEvaluateArgs:
    """Test BrowserEvaluateArgs schema."""

    def test_valid_evaluate(self):
        """Test valid evaluate args."""
        args = BrowserEvaluateArgs(
            action="evaluate",
            script="window.location.href",
        )
        assert args.script == "window.location.href"

    def test_script_too_long(self):
        """Test script length validation."""
        with pytest.raises(ValidationError):
            BrowserEvaluateArgs(
                action="evaluate",
                script="x" * 10000,
            )


class TestBrowserCloseArgs:
    """Test BrowserCloseArgs schema."""

    def test_valid_close(self):
        """Test valid close args."""
        args = BrowserCloseArgs(action="close")
        assert args.action == "close"


class TestSchemaRegistry:
    """Test schema registry functions."""

    def test_get_browser_schema_valid(self):
        """Test getting valid schema."""
        schema = get_browser_schema("click")
        assert schema is BrowserClickArgs

    def test_get_browser_schema_compat_action(self):
        """Test getting compat schema for OpenClaw action names."""
        schema = get_browser_schema("act")
        assert schema is not None
        assert get_browser_schema("errors") is None
        assert get_browser_schema("requests") is None
        assert get_browser_schema("set_offline") is None

    def test_get_browser_schema_includes_all_openclaw_compat_actions(self):
        """Test generated registry entries for all OpenClaw-compatible actions."""
        for action in OPENCLAW_COMPAT_ACTIONS:
            assert get_browser_schema(action) is not None

    def test_get_browser_schema_extract(self):
        """Test getting extract schema."""
        schema = get_browser_schema("extract")
        assert schema is BrowserExtractArgs

    def test_get_browser_schema_invalid(self):
        """Test getting invalid schema."""
        schema = get_browser_schema("nonexistent")
        assert schema is None

    def test_validate_browser_args_valid(self):
        """Test validating valid args."""
        is_valid, error = validate_browser_args("click", {"ref": "5"})
        assert is_valid is True
        assert error is None

    def test_validate_browser_args_act_valid(self):
        """Test validating compat act arguments."""
        is_valid, error = validate_browser_args(
            "act",
            {"request": {"kind": "click", "ref": "1"}},
        )
        assert is_valid is True
        assert error is None

    def test_validate_browser_args_invalid(self):
        """Test validating invalid args."""
        is_valid, error = validate_browser_args("click", {})
        assert is_valid is False
        assert error is not None

    def test_validate_browser_args_unknown_action(self):
        """Test validating unknown action."""
        is_valid, error = validate_browser_args("unknown", {})
        assert is_valid is False
        assert "Unknown" in error
