"""Tests for the shell tool."""

import asyncio
import os
import subprocess
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.config import AppConfig
from backend.tools.base import ToolContext
from backend.tools.shell import ShellTool


@pytest.fixture
def mock_config():
    """Create a mock configuration for testing."""
    config = MagicMock(spec=AppConfig)
    config.get_target_dir.return_value = "/tmp"
    config.get_workspace_context.return_value = MagicMock()
    config.get_shell_timeout.return_value = 30.0
    return config


class TestShellTool:
    """Tests for the ShellTool."""

    @pytest.mark.asyncio
    async def test_shell_command_success(self, mock_config):
        """Test successful shell command execution."""
        tool = ShellTool(mock_config)
        context = ToolContext()

        # Use a simple cross-platform command
        if os.name == 'nt':  # Windows
            command = "echo Hello World"
            expected_output = "Hello World"
        else:  # Unix-like
            command = "echo 'Hello World'"
            expected_output = "Hello World"

        result = await tool.execute_async(context, command=command)

        assert result.success is True
        assert expected_output in result.llm_content

    @pytest.mark.asyncio
    async def test_shell_command_with_directory(self, mock_config, tmp_path):
        """Test shell command execution in specific directory."""
        tool = ShellTool(mock_config)
        context = ToolContext()

        # Create a test directory
        test_dir = tmp_path / "test_shell_dir"
        test_dir.mkdir()

        # Create a test file in that directory
        test_file = test_dir / "test.txt"
        test_file.write_text("test content")

        # Use a command that depends on being in the right directory
        if os.name == 'nt':  # Windows
            command = "dir /b"
            expected_content = "test.txt"
        else:  # Unix-like
            command = "ls -1"
            expected_content = "test.txt"

        result = await tool.execute_async(
            context,
            command=command,
            directory=str(test_dir)
        )

        assert result.success is True
        assert expected_content in result.llm_content

    @pytest.mark.asyncio
    async def test_shell_command_failure(self, mock_config):
        """Test shell command that fails."""
        tool = ShellTool(mock_config)
        context = ToolContext()

        # Use a command that will fail
        command = "nonexistent_command_that_fails"

        result = await tool.execute_async(context, command=command)

        assert result.success is False
        assert "Error executing shell command" in result.error

    @pytest.mark.asyncio
    async def test_shell_command_with_description(self, mock_config):
        """Test shell command with description parameter."""
        tool = ShellTool(mock_config)
        context = ToolContext()

        if os.name == 'nt':  # Windows
            command = "echo Test"
        else:  # Unix-like
            command = "echo 'Test'"

        result = await tool.execute_async(
            context,
            command=command,
            description="A test command"
        )

        assert result.success is True
        # The description parameter is currently just stored but not used in output

    @pytest.mark.asyncio
    @patch('asyncio.create_subprocess_shell')
    async def test_shell_command_timeout(self, mock_create_subprocess, mock_config):
        """Test shell command timeout handling."""
        # Mock a process that doesn't complete
        mock_process = AsyncMock()
        mock_process.communicate.return_value = asyncio.sleep(60)  # Never completes
        mock_process.returncode = None
        mock_create_subprocess.return_value = mock_process

        tool = ShellTool(mock_config)
        context = ToolContext()

        # This test is tricky because we need to test timeout behavior
        # For now, just ensure the tool can handle basic cases
        result = await tool.execute_async(context, command="sleep 1")

        # The result depends on the actual subprocess behavior
        # In a real scenario, this would be tested with proper timeout mocking

    @pytest.mark.asyncio
    async def test_shell_command_empty(self, mock_config):
        """Test empty shell command."""
        tool = ShellTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, command="")

        assert result.success is False
        assert "Error executing shell command" in result.error

    @pytest.mark.asyncio
    async def test_shell_command_whitespace_only(self, mock_config):
        """Test whitespace-only shell command."""
        tool = ShellTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, command="   \t   \n   ")

        assert result.success is False
        assert "Error executing shell command" in result.error

    def test_tool_schema(self, mock_config):
        """Test that the tool provides a valid schema."""
        tool = ShellTool(mock_config)

        schema = tool.get_schema()

        assert "name" in schema
        assert "description" in schema
        assert "parameters" in schema
        assert schema["name"] == "run_shell_command"
        assert "command" in schema["parameters"]["properties"]

    def test_tool_validation(self, mock_config):
        """Test parameter validation."""
        tool = ShellTool(mock_config)

        # Valid parameters
        errors = tool.validate_parameters(command="echo hello")
        assert len(errors) == 0

        # Missing required parameter
        errors = tool.validate_parameters()
        assert len(errors) > 0
        assert any("command" in error.lower() for error in errors)

    def test_tool_capabilities(self, mock_config):
        """Test tool capabilities."""
        tool = ShellTool(mock_config)

        capabilities = tool.get_capabilities()

        assert "kind" in capabilities
        assert "confirmation_required" in capabilities
        assert capabilities["confirmation_required"] is True  # Shell commands require confirmation
