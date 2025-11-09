"""Tests for computer control tools (mouse, keyboard, screenshot, scroll)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.agent.state.exceptions import ToolExecutionError
from backend.config import AppConfig, AppServices
from backend.tools.core.computer.keyboard_tool import KeyboardTool
from backend.tools.core.computer.mouse_tool import MouseTool
from backend.tools.core.computer.screenshot_tool import ScreenshotTool
from backend.tools.core.computer.scroll_tool import ScrollTool
from backend.tools.base import ToolContext, ToolResult

# Mark all tests in this file as async
pytestmark = pytest.mark.asyncio


@pytest.fixture
def mock_config():
    """Create a mock AppConfig for testing."""
    config = MagicMock(spec=AppConfig)
    return config


@pytest.fixture
def mock_services(mock_config):
    """Create a mock AppServices for testing."""
    services = MagicMock(spec=AppServices)
    services.config = mock_config
    return services


@pytest.fixture
def mock_computer_interface():
    """Create a mock computer interface."""
    mock_ci = MagicMock()
    mock_ci.initialize = AsyncMock(return_value=True)
    return mock_ci


@pytest.fixture
def mock_mouse_tool(mock_services, mock_computer_interface):
    """Create a MouseTool with mocked dependencies."""
    with patch('backend.tools.core.computer.mouse_tool.ComputerInterface') as mock_ci_class:
        mock_ci_class.return_value = mock_computer_interface
        tool = MouseTool(mock_services)
        tool.computer = mock_computer_interface
        yield tool


@pytest.fixture
def mock_keyboard_tool(mock_services, mock_computer_interface):
    """Create a KeyboardTool with mocked dependencies."""
    with patch('backend.tools.core.computer.keyboard_tool.ComputerInterface') as mock_ci_class:
        mock_ci_class.return_value = mock_computer_interface
        tool = KeyboardTool(mock_services)
        tool.computer = mock_computer_interface
        yield tool


@pytest.fixture
def mock_screenshot_tool(mock_services, mock_computer_interface):
    """Create a ScreenshotTool with mocked dependencies."""
    with patch('backend.tools.core.computer.screenshot_tool.ComputerInterface') as mock_ci_class:
        mock_ci_class.return_value = mock_computer_interface
        tool = ScreenshotTool(mock_services)
        tool.computer = mock_computer_interface
        yield tool


@pytest.fixture
def mock_scroll_tool(mock_services, mock_computer_interface):
    """Create a ScrollTool with mocked dependencies."""
    with patch('backend.tools.core.computer.scroll_tool.ComputerInterface') as mock_ci_class:
        mock_ci_class.return_value = mock_computer_interface
        tool = ScrollTool(mock_services)
        tool.computer = mock_computer_interface
        yield tool


@pytest.fixture
def tool_context():
    """Create a ToolContext for testing."""
    return ToolContext()


class TestMouseTool:
    """Tests for MouseTool functionality."""

    async def test_click_action(self, mock_mouse_tool, tool_context):
        """Test mouse click action."""
        # Setup
        mock_mouse_tool.computer.left_click = AsyncMock(return_value=MagicMock(
            success=True, message="Left-clicked at (100, 200)"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="click",
            x=100,
            y=200
        )

        # Assert
        assert result.success is True
        assert "Left-clicked at (100, 200)" in result.llm_content
        mock_mouse_tool.computer.left_click.assert_called_once_with(100, 200)

    async def test_right_click_action(self, mock_mouse_tool, tool_context):
        """Test mouse right click action."""
        # Setup
        mock_mouse_tool.computer.right_click = AsyncMock(return_value=MagicMock(
            success=True, message="Right-clicked at (150, 250)"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="right_click",
            x=150,
            y=250
        )

        # Assert
        assert result.success is True
        assert "Right-clicked at (150, 250)" in result.llm_content
        mock_mouse_tool.computer.right_click.assert_called_once_with(150, 250)

    async def test_double_click_action(self, mock_mouse_tool, tool_context):
        """Test mouse double click action."""
        # Setup
        mock_mouse_tool.computer.double_click = AsyncMock(return_value=MagicMock(
            success=True, message="Double-clicked at (200, 300)"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="double_click",
            x=200,
            y=300
        )

        # Assert
        assert result.success is True
        assert "Double-clicked at (200, 300)" in result.llm_content
        mock_mouse_tool.computer.double_click.assert_called_once_with(200, 300)

    async def test_move_action(self, mock_mouse_tool, tool_context):
        """Test mouse move action."""
        # Setup
        mock_mouse_tool.computer.move_cursor = AsyncMock(return_value=MagicMock(
            success=True, message="Cursor moved to (300, 400)"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="move",
            x=300,
            y=400
        )

        # Assert
        assert result.success is True
        assert "Cursor moved to (300, 400)" in result.llm_content
        mock_mouse_tool.computer.move_cursor.assert_called_once_with(300, 400)

    async def test_drag_action(self, mock_mouse_tool, tool_context):
        """Test mouse drag action."""
        # Setup
        mock_mouse_tool.computer.drag_to = AsyncMock(return_value=MagicMock(
            success=True, message="Dragged to (400, 500)"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="drag",
            x=400,
            y=500,
            duration=1.0
        )

        # Assert
        assert result.success is True
        assert "Dragged to (400, 500)" in result.llm_content
        mock_mouse_tool.computer.drag_to.assert_called_once_with(400, 500, "left", 1.0)

    async def test_mouse_down_action(self, mock_mouse_tool, tool_context):
        """Test mouse down action."""
        # Setup
        mock_mouse_tool.computer.mouse_down = AsyncMock(return_value=MagicMock(
            success=True, message="Mouse button down at (100, 100)"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="mouse_down",
            x=100,
            y=100,
            button="right"
        )

        # Assert
        assert result.success is True
        assert "Mouse button down at (100, 100)" in result.llm_content
        mock_mouse_tool.computer.mouse_down.assert_called_once_with(100, 100, "right")

    async def test_mouse_up_action(self, mock_mouse_tool, tool_context):
        """Test mouse up action."""
        # Setup
        mock_mouse_tool.computer.mouse_up = AsyncMock(return_value=MagicMock(
            success=True, message="Mouse button up at (200, 200)"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="mouse_up",
            x=200,
            y=200,
            button="middle"
        )

        # Assert
        assert result.success is True
        assert "Mouse button up at (200, 200)" in result.llm_content
        mock_mouse_tool.computer.mouse_up.assert_called_once_with(200, 200, "middle")

    async def test_invalid_action(self, mock_mouse_tool, tool_context):
        """Test invalid mouse action."""
        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="invalid_action",
            x=100,
            y=100
        )

        # Assert
        assert result.success is False
        assert "Unknown mouse action" in result.error

    async def test_missing_coordinates_for_click(self, mock_mouse_tool, tool_context):
        """Test click action without coordinates."""
        # Setup - mock left_click to handle None coordinates
        mock_mouse_tool.computer.left_click = AsyncMock(return_value=MagicMock(
            success=True, message="Left-clicked at current position"
        ))

        # Execute
        result = await mock_mouse_tool.execute_async(
            context=tool_context,
            action="click"
            # No x, y coordinates
        )

        # Assert - should work with None coordinates (click at current position)
        assert result.success is True
        assert "Left-clicked at current position" in result.llm_content


class TestKeyboardTool:
    """Tests for KeyboardTool functionality."""

    async def test_type_action(self, mock_keyboard_tool, tool_context):
        """Test keyboard type action."""
        # Setup
        mock_keyboard_tool.computer.type_text = AsyncMock(return_value=MagicMock(
            success=True, message="Typed text: Hello World"
        ))

        # Execute
        result = await mock_keyboard_tool.execute_async(
            context=tool_context,
            action="type",
            text="Hello World"
        )

        # Assert
        assert result.success is True
        assert "Typed text: Hello World" in result.llm_content
        mock_keyboard_tool.computer.type_text.assert_called_once_with("Hello World")

    async def test_press_action(self, mock_keyboard_tool, tool_context):
        """Test keyboard press action."""
        # Setup
        mock_keyboard_tool.computer.press_key = AsyncMock(return_value=MagicMock(
            success=True, message="Pressed key: enter"
        ))

        # Execute
        result = await mock_keyboard_tool.execute_async(
            context=tool_context,
            action="press",
            key="enter"
        )

        # Assert
        assert result.success is True
        assert "Pressed key: enter" in result.llm_content
        mock_keyboard_tool.computer.press_key.assert_called_once_with("enter")

    async def test_hotkey_action(self, mock_keyboard_tool, tool_context):
        """Test keyboard hotkey action."""
        # Setup
        mock_keyboard_tool.computer.hotkey = AsyncMock(return_value=MagicMock(
            success=True, message="Pressed hotkey: ctrl+c"
        ))

        # Execute
        result = await mock_keyboard_tool.execute_async(
            context=tool_context,
            action="hotkey",
            keys=["ctrl", "c"]
        )

        # Assert
        assert result.success is True
        assert "Pressed hotkey: ctrl+c" in result.llm_content
        mock_keyboard_tool.computer.hotkey.assert_called_once_with("ctrl", "c")

    async def test_invalid_action(self, mock_keyboard_tool, tool_context):
        """Test invalid keyboard action."""
        # Execute
        result = await mock_keyboard_tool.execute_async(
            context=tool_context,
            action="invalid_action"
        )

        # Assert
        assert result.success is False
        assert "Unknown keyboard action" in result.error

    async def test_type_without_text(self, mock_keyboard_tool, tool_context):
        """Test type action without text parameter."""
        # Execute
        result = await mock_keyboard_tool.execute_async(
            context=tool_context,
            action="type"
            # No text parameter
        )

        # Assert
        assert result.success is False
        assert "text parameter required" in result.error.lower()


class TestScreenshotTool:
    """Tests for ScreenshotTool functionality."""

    async def test_screenshot_action(self, mock_screenshot_tool, tool_context):
        """Test screenshot capture."""
        # Setup
        mock_screenshot_tool.computer.screenshot = AsyncMock(return_value=MagicMock(
            success=True,
            message="Screenshot captured",
            screenshot_data="base64data"
        ))

        # Execute
        result = await mock_screenshot_tool.execute_async(
            context=tool_context,
            action="screenshot"
        )

        # Assert
        assert result.success is True
        assert "Screenshot captured" in result.llm_content
        mock_screenshot_tool.computer.screenshot.assert_called_once()


class TestScrollTool:
    """Tests for ScrollTool functionality."""

    async def test_scroll_action(self, mock_scroll_tool, tool_context):
        """Test scroll action."""
        # Setup
        mock_scroll_tool.computer.scroll = AsyncMock(return_value=MagicMock(
            success=True, message="Scrolled at (100, 200) by 3 clicks"
        ))

        # Execute
        result = await mock_scroll_tool.execute_async(
            context=tool_context,
            action="scroll",
            x=100,
            y=200,
            clicks=3
        )

        # Assert
        assert result.success is True
        assert "Scrolled at (100, 200) by 3 clicks" in result.llm_content
        mock_scroll_tool.computer.scroll.assert_called_once_with(100, 200, 3)

    async def test_scroll_up_action(self, mock_scroll_tool, tool_context):
        """Test scroll up action."""
        # Setup
        mock_scroll_tool.computer.scroll_up = AsyncMock(return_value=MagicMock(
            success=True, message="Scrolled up by 5 clicks"
        ))

        # Execute
        result = await mock_scroll_tool.execute_async(
            context=tool_context,
            action="scroll_up",
            clicks=5
        )

        # Assert
        assert result.success is True
        assert "Scrolled up by 5 clicks" in result.llm_content
        mock_scroll_tool.computer.scroll_up.assert_called_once_with(5)

    async def test_scroll_down_action(self, mock_scroll_tool, tool_context):
        """Test scroll down action."""
        # Setup
        mock_scroll_tool.computer.scroll_down = AsyncMock(return_value=MagicMock(
            success=True, message="Scrolled down by 2 clicks"
        ))

        # Execute
        result = await mock_scroll_tool.execute_async(
            context=tool_context,
            action="scroll_down",
            clicks=2
        )

        # Assert
        assert result.success is True
        assert "Scrolled down by 2 clicks" in result.llm_content
        mock_scroll_tool.computer.scroll_down.assert_called_once_with(2)

    async def test_invalid_action(self, mock_scroll_tool, tool_context):
        """Test invalid scroll action."""
        # Execute
        result = await mock_scroll_tool.execute_async(
            context=tool_context,
            action="invalid_action"
        )

        # Assert
        assert result.success is False
        assert "Unknown scroll action" in result.error


class TestComputerToolIntegration:
    """Integration tests for computer tools."""

    async def test_all_tools_have_schemas(self, mock_config, mock_services):
        """Test that all computer tools can generate schemas."""
        tools = [
            MouseTool(mock_services),
            KeyboardTool(mock_services),
            ScreenshotTool(mock_services),
            ScrollTool(mock_services),
        ]

        for tool in tools:
            schema = tool.get_schema()
            assert "name" in schema
            assert "description" in schema
            assert "parameters" in schema
            assert "type" in schema["parameters"]
            assert schema["parameters"]["type"] == "object"

    async def test_tools_handle_computer_interface_failure(self, mock_services):
        """Test that tools handle computer interface initialization failure."""
        # Setup mock computer interface that fails to initialize
        with patch('backend.tools.core.computer.mouse_tool.ComputerInterface') as mock_ci_class:
            mock_ci = MagicMock()
            mock_ci.initialize = AsyncMock(return_value=False)
            mock_ci._initialized = False  # Set the initialized flag to False
            mock_ci_class.return_value = mock_ci

            tool = MouseTool(mock_services)
            tool.computer = mock_ci

            tool_context = ToolContext()

            # Execute
            result = await tool.execute_async(
                context=tool_context,
                action="click",
                x=100,
                y=100
            )

            # Assert
            assert result.success is False
            assert "Failed to initialize computer interface" in result.error

    async def test_computer_tools_include_screenshot_in_result_message(self, mock_services):
        """Test that computer tool results include automatic screenshots."""
        from backend.agent.agent_session import Agent
        from backend.agent.state.exceptions import ToolExecutionError
        from backend.config import AppConfig

        # Mock config and services
        config = AppConfig()
        config.selected_model_id = "test-model"

        # Create agent with mocked LLM client
        with patch('backend.agent.llm.llm_client.get_llm_client') as mock_get_client:
            mock_llm_client = MagicMock()
            mock_get_client.return_value = mock_llm_client

            agent = Agent(config)

            # Mock tool registry to return computer tool
            mock_registry = MagicMock()
            mock_registry.is_tool_available.return_value = True

            # Mock successful mouse click result
            mock_tool_result = MagicMock()
            mock_tool_result.success = True
            mock_tool_result.llm_content = "Left-clicked at (100, 200)"
            mock_tool_result.return_display = "Left-clicked at (100, 200)"

            # Mock screenshot result
            mock_screenshot_result = MagicMock()
            mock_screenshot_result.success = True
            mock_screenshot_result.data = {"screenshot": "base64_screenshot_data"}

            # Mock the async execute_tool method
            async def mock_execute_tool(tool_name):
                if tool_name == "mouse_control":
                    return mock_tool_result
                elif tool_name == "screenshot":
                    return mock_screenshot_result
                return None

            mock_registry.execute_tool = mock_execute_tool

            agent.tool_registry = mock_registry

            # Mock parsed response with mouse tool call
            from backend.agent.execution.response_parser import ParsedToolCall, ParsedResponse
            parsed_response = ParsedResponse(
                original_response='{"functionCall": {"name": "mouse_control", "args": {"action": "click", "x": 100, "y": 200}}}',
                tool_calls=[
                    ParsedToolCall(
                        tool_name="mouse_control",
                        parameters={"action": "click", "x": 100, "y": 200},
                        raw_call='{"functionCall": {"name": "mouse_control", "args": {"action": "click", "x": 100, "y": 200}}}'
                    )
                ],
                text_content="",
                has_tool_calls=True
            )

            # Execute tools
            events = []
            async for event in agent._execute_tools(parsed_response):
                events.append(event)

            # Check that history was updated with screenshot
            assert len(agent.history.history) > 0
            tool_message = agent.history.history[-1]["content"]

            # Verify the message includes screenshot
            assert "✅ TOOL EXECUTED SUCCESSFULLY: mouse_control" in tool_message
            assert "📄 RESULT:\nLeft-clicked at (100, 200)" in tool_message
            assert "📸 SCREENSHOT AFTER ACTION:\nbase64_screenshot_data" in tool_message
            assert "🎯 TASK COMPLETE" in tool_message
