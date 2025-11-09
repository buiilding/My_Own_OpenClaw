"""Tests for the tool registry functionality."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.config import AppConfig
from backend.tools.base import ToolResult
from backend.tools.registry import ToolRegistry, create_tool_registry


@pytest.fixture
def mock_config():
    """Create a mock configuration for testing."""
    config = MagicMock(spec=AppConfig)
    return config


class TestToolRegistry:
    """Tests for the ToolRegistry class."""

    def test_tool_registry_initialization(self, mock_config):
        """Test that tool registry initializes correctly."""
        registry = ToolRegistry(mock_config)

        assert registry.config == mock_config
        assert isinstance(registry.tools, dict)
        assert len(registry.tools) > 0  # Should have built-in tools

    def test_tool_registry_registers_builtin_tools(self, mock_config):
        """Test that built-in tools are registered."""
        registry = ToolRegistry(mock_config)

        # Check that key tools are registered
        expected_tools = [
            'list_directory', 'read_file', 'write_file', 'glob',
            'search_file_content', 'replace', 'read_many_files', 'run_shell_command'
        ]

        for tool_name in expected_tools:
            assert tool_name in registry.tools, f"Tool '{tool_name}' not found in registry"

    def test_get_tool(self, mock_config):
        """Test getting a tool by name."""
        registry = ToolRegistry(mock_config)

        tool = registry.get_tool('read_file')
        assert tool is not None
        assert tool.name == 'read_file'

        # Test nonexistent tool
        tool = registry.get_tool('nonexistent_tool')
        assert tool is None

    def test_get_all_tools(self, mock_config):
        """Test getting all registered tools."""
        registry = ToolRegistry(mock_config)

        tools = registry.get_all_tools()
        assert isinstance(tools, list)
        assert len(tools) > 0

        # Check that each tool has required attributes
        for tool in tools:
            assert hasattr(tool, 'name')
            assert hasattr(tool, 'description')
            assert callable(getattr(tool, 'get_schema', None))

    def test_get_tool_names(self, mock_config):
        """Test getting tool names."""
        registry = ToolRegistry(mock_config)

        names = registry.get_tool_names()
        assert isinstance(names, list)
        assert len(names) > 0

        # Should include expected tool names
        expected_names = ['read_file', 'write_file', 'list_directory']
        for name in expected_names:
            assert name in names

    def test_get_function_declarations(self, mock_config):
        """Test getting function declarations for all tools."""
        registry = ToolRegistry(mock_config)

        declarations = registry.get_function_declarations()
        assert isinstance(declarations, list)
        assert len(declarations) > 0

        # Each declaration should be a dict with required fields
        for decl in declarations:
            assert isinstance(decl, dict)
            assert 'name' in decl
            assert 'description' in decl
            assert 'parameters' in decl

    def test_get_function_declarations_filtered(self, mock_config):
        """Test getting function declarations for specific tools."""
        registry = ToolRegistry(mock_config)

        # Get declarations for specific tools
        tool_names = ['read_file', 'write_file']
        declarations = registry.get_function_declarations_filtered(tool_names)

        assert isinstance(declarations, list)
        assert len(declarations) == 2

        # Check that we got the right tools
        names = [decl['name'] for decl in declarations]
        assert 'read_file' in names
        assert 'write_file' in names

    def test_register_tool(self, mock_config):
        """Test registering a new tool."""
        registry = ToolRegistry(mock_config)

        # Create a mock tool
        mock_tool = MagicMock()
        mock_tool.name = 'test_tool'
        mock_tool.description = 'A test tool'

        initial_count = len(registry.tools)

        registry.register_tool(mock_tool)

        assert len(registry.tools) == initial_count + 1
        assert 'test_tool' in registry.tools
        assert registry.tools['test_tool'] == mock_tool

    def test_register_duplicate_tool(self, mock_config):
        """Test registering a tool that already exists."""
        registry = ToolRegistry(mock_config)

        # Get an existing tool
        existing_tool = registry.get_tool('read_file')
        assert existing_tool is not None

        # Create a mock replacement tool
        mock_tool = MagicMock()
        mock_tool.name = 'read_file'
        mock_tool.description = 'Replacement tool'

        # Register it (should overwrite)
        registry.register_tool(mock_tool)

        # Should now have the replacement
        assert registry.get_tool('read_file') == mock_tool

    @pytest.mark.asyncio
    async def test_execute_tool_success(self, mock_config):
        """Test successful tool execution."""
        registry = ToolRegistry(mock_config)

        # Mock a tool for testing
        mock_tool = MagicMock()
        mock_tool.name = 'test_tool'
        mock_tool.validate_parameters.return_value = []
        mock_tool.execute_async = AsyncMock(return_value=ToolResult(
            success=True,
            llm_content="Test result",
            return_display="Test result"
        ))

        registry.register_tool(mock_tool)

        result = await registry.execute_tool('test_tool', param1='value1')

        assert result.success is True
        assert result.llm_content == "Test result"
        mock_tool.validate_parameters.assert_called_once_with(param1='value1')
        mock_tool.execute_async.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_tool_validation_failure(self, mock_config):
        """Test tool execution with validation failure."""
        registry = ToolRegistry(mock_config)

        # Mock a tool that fails validation
        mock_tool = MagicMock()
        mock_tool.name = 'test_tool'
        mock_tool.validate_parameters.return_value = ["Missing required parameter"]

        registry.register_tool(mock_tool)

        result = await registry.execute_tool('test_tool')

        assert result.success is False
        assert "Parameter validation failed" in result.error
        mock_tool.execute_async.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_tool_not_found(self, mock_config):
        """Test executing a nonexistent tool."""
        registry = ToolRegistry(mock_config)

        result = await registry.execute_tool('nonexistent_tool')

        assert result.success is False
        assert "not found" in result.error

    def test_is_tool_available(self, mock_config):
        """Test checking if a tool is available."""
        registry = ToolRegistry(mock_config)

        assert registry.is_tool_available('read_file') is True
        assert registry.is_tool_available('nonexistent_tool') is False

    def test_get_tool_capabilities(self, mock_config):
        """Test getting tool capabilities."""
        registry = ToolRegistry(mock_config)

        capabilities = registry.get_tool_capabilities('read_file')
        assert isinstance(capabilities, dict) or capabilities is None

        # For a real tool, should return capabilities
        if capabilities:
            assert 'kind' in capabilities

    def test_get_tools_by_kind(self, mock_config):
        """Test getting tools by kind."""
        registry = ToolRegistry(mock_config)

        # Get file system tools
        file_tools = registry.get_tools_by_kind('filesystem')
        assert isinstance(file_tools, list)

        # Should include read_file, write_file, etc.
        tool_names = [tool.name for tool in file_tools]
        assert 'read_file' in tool_names

    def test_enable_disable_tool(self, mock_config):
        """Test enabling/disabling tools."""
        registry = ToolRegistry(mock_config)

        # For now, tools are always enabled
        assert registry.enable_tool('read_file') is True
        assert registry.disable_tool('read_file') is True
        assert registry.enable_tool('nonexistent') is False

    def test_get_registry_stats(self, mock_config):
        """Test getting registry statistics."""
        registry = ToolRegistry(mock_config)

        stats = registry.get_registry_stats()

        assert isinstance(stats, dict)
        assert 'total_tools' in stats
        assert 'tools_by_kind' in stats
        assert 'tool_names' in stats

        assert stats['total_tools'] > 0
        assert isinstance(stats['tool_names'], list)
        assert len(stats['tool_names']) == stats['total_tools']

    def test_create_tool_registry(self, mock_config):
        """Test the create_tool_registry factory function."""
        registry = create_tool_registry(mock_config)

        assert isinstance(registry, ToolRegistry)
        assert registry.config == mock_config
        assert len(registry.tools) > 0


class TestToolRegistryIntegration:
    """Integration tests for tool registry with real tools."""

    def test_real_tools_have_schemas(self, mock_config):
        """Test that real tools provide valid schemas."""
        registry = ToolRegistry(mock_config)

        for tool_name in ['read_file', 'write_file', 'list_directory']:
            tool = registry.get_tool(tool_name)
            assert tool is not None

            schema = tool.get_schema()
            assert isinstance(schema, dict)
            assert 'name' in schema
            assert 'description' in schema
            assert 'parameters' in schema

    def test_real_tools_have_capabilities(self, mock_config):
        """Test that real tools provide capabilities."""
        registry = ToolRegistry(mock_config)

        for tool_name in ['read_file', 'run_shell_command']:
            capabilities = registry.get_tool_capabilities(tool_name)
            assert isinstance(capabilities, dict) or capabilities is None

            if capabilities:
                assert 'kind' in capabilities
                assert 'confirmation_required' in capabilities
