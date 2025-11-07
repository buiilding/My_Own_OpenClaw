"""Tests for file system tools."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.config import AppConfig
from backend.tools.base import ToolContext
from backend.tools.filesystem import (
    GlobTool, ListDirectoryTool, ReadFileTool, ReadManyFilesTool,
    ReplaceTool, SearchFileContentTool, WriteFileTool
)


@pytest.fixture
def mock_config():
    """Create a mock configuration for testing."""
    config = MagicMock(spec=AppConfig)
    config.get_target_dir.return_value = "/tmp"
    config.get_workspace_context.return_value = MagicMock()
    config.storage = MagicMock()
    config.storage.get_project_temp_dir.return_value = "/tmp"
    config.get_file_service.return_value = MagicMock()
    config.get_file_filtering_options.return_value = {
        "respect_git_ignore": True,
        "respect_gemini_ignore": True
    }
    return config


@pytest.fixture
def temp_dir():
    """Create a temporary directory for testing."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield Path(temp_dir)


class TestListDirectoryTool:
    """Tests for the ListDirectoryTool."""

    @pytest.mark.asyncio
    async def test_list_directory_success(self, mock_config, temp_dir):
        """Test successful directory listing."""
        # Create test files and directories
        (temp_dir / "file1.txt").write_text("content1")
        (temp_dir / "file2.txt").write_text("content2")
        (temp_dir / "subdir").mkdir()
        (temp_dir / "subdir" / "nested.txt").write_text("nested")

        tool = ListDirectoryTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, path=str(temp_dir))

        assert result.success is True
        assert "file1.txt" in result.llm_content
        assert "file2.txt" in result.llm_content
        assert "[DIR] subdir" in result.llm_content

    @pytest.mark.asyncio
    async def test_list_directory_nonexistent(self, mock_config):
        """Test listing a nonexistent directory."""
        tool = ListDirectoryTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, path="/nonexistent/path")

        assert result.success is False
        assert "Error listing directory" in result.error

    @pytest.mark.asyncio
    async def test_list_directory_with_ignore_patterns(self, mock_config, temp_dir):
        """Test directory listing with ignore patterns."""
        # Create test files
        (temp_dir / "file1.txt").write_text("content1")
        (temp_dir / "file2.log").write_text("content2")
        (temp_dir / "important.txt").write_text("important")

        tool = ListDirectoryTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            path=str(temp_dir),
            ignore=["*.log"]
        )

        assert result.success is True
        assert "file1.txt" in result.llm_content
        assert "important.txt" in result.llm_content
        assert "file2.log" not in result.llm_content


class TestReadFileTool:
    """Tests for the ReadFileTool."""

    @pytest.mark.asyncio
    async def test_read_file_success(self, mock_config, temp_dir):
        """Test successful file reading."""
        test_file = temp_dir / "test.txt"
        test_content = "This is a test file\nwith multiple lines\nand content."
        test_file.write_text(test_content)

        tool = ReadFileTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, path=str(test_file))

        assert result.success is True
        assert test_content in result.llm_content

    @pytest.mark.asyncio
    async def test_read_file_with_line_limits(self, mock_config, temp_dir):
        """Test file reading with line limits."""
        test_file = temp_dir / "test.txt"
        test_content = "\n".join([f"Line {i}" for i in range(100)])
        test_file.write_text(test_content)

        tool = ReadFileTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            path=str(test_file),
            offset=10,
            limit=5
        )

        assert result.success is True
        assert "Line 10" in result.llm_content
        assert "Line 14" in result.llm_content
        # Should not contain lines outside the range
        assert "Line 9" not in result.llm_content

    @pytest.mark.asyncio
    async def test_read_file_nonexistent(self, mock_config):
        """Test reading a nonexistent file."""
        tool = ReadFileTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, path="/nonexistent/file.txt")

        assert result.success is False
        assert "Error reading file" in result.error

    @pytest.mark.asyncio
    async def test_read_file_absolute_path(self, mock_config, temp_dir):
        """Test reading with absolute path parameter."""
        test_file = temp_dir / "test.txt"
        test_content = "Test content"
        test_file.write_text(test_content)

        tool = ReadFileTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, absolute_path=str(test_file))

        assert result.success is True
        assert test_content in result.llm_content


class TestWriteFileTool:
    """Tests for the WriteFileTool."""

    @pytest.mark.asyncio
    async def test_write_file_success(self, mock_config, temp_dir):
        """Test successful file writing."""
        test_file = temp_dir / "new_file.txt"
        test_content = "This is new content for the file."

        tool = WriteFileTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            file_path=str(test_file),
            content=test_content
        )

        assert result.success is True
        assert "Successfully" in result.llm_content
        assert test_file.exists()
        assert test_file.read_text() == test_content

    @pytest.mark.asyncio
    async def test_write_file_overwrite(self, mock_config, temp_dir):
        """Test overwriting existing file."""
        test_file = temp_dir / "existing.txt"
        test_file.write_text("Original content")

        new_content = "New content that replaces the original"

        tool = WriteFileTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            file_path=str(test_file),
            content=new_content
        )

        assert result.success is True
        assert "overwrote file" in result.llm_content
        assert test_file.read_text() == new_content

    @pytest.mark.asyncio
    async def test_write_file_creates_directories(self, mock_config, temp_dir):
        """Test that parent directories are created."""
        nested_file = temp_dir / "nested" / "deep" / "file.txt"
        test_content = "Content in nested file"

        tool = WriteFileTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            file_path=str(nested_file),
            content=test_content
        )

        assert result.success is True
        assert nested_file.exists()
        assert nested_file.read_text() == test_content


class TestGlobTool:
    """Tests for the GlobTool."""

    @pytest.mark.asyncio
    async def test_glob_success(self, mock_config, temp_dir):
        """Test successful glob pattern matching."""
        # Create test files
        (temp_dir / "test1.txt").write_text("content1")
        (temp_dir / "test2.txt").write_text("content2")
        (temp_dir / "other.py").write_text("python code")
        (temp_dir / "subdir").mkdir()
        (temp_dir / "subdir" / "nested.txt").write_text("nested")

        tool = GlobTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, pattern="*.txt", path=str(temp_dir))

        assert result.success is True
        assert "test1.txt" in result.llm_content
        assert "test2.txt" in result.llm_content
        assert "other.py" not in result.llm_content

    @pytest.mark.asyncio
    async def test_glob_recursive(self, mock_config, temp_dir):
        """Test recursive glob patterns."""
        # Create nested structure
        (temp_dir / "file.txt").write_text("root file")
        (temp_dir / "subdir1").mkdir()
        (temp_dir / "subdir1" / "file.txt").write_text("nested file 1")
        (temp_dir / "subdir2").mkdir()
        (temp_dir / "subdir2" / "file.txt").write_text("nested file 2")

        tool = GlobTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(context, pattern="**/*.txt", path=str(temp_dir))

        assert result.success is True
        assert "subdir1/file.txt" in result.llm_content
        assert "subdir2/file.txt" in result.llm_content


class TestSearchFileContentTool:
    """Tests for the SearchFileContentTool."""

    @pytest.mark.asyncio
    async def test_search_success(self, mock_config, temp_dir):
        """Test successful content search."""
        # Create test files with content
        file1 = temp_dir / "file1.txt"
        file1.write_text("This file contains the word 'needle' in it.\nMore content here.")

        file2 = temp_dir / "file2.txt"
        file2.write_text("This file also has needle and more text.")

        file3 = temp_dir / "file3.txt"
        file3.write_text("This file has no matching content.")

        tool = SearchFileContentTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            pattern="needle",
            path=str(temp_dir)
        )

        assert result.success is True
        assert "file1.txt" in result.llm_content
        assert "file2.txt" in result.llm_content
        assert "file3.txt" not in result.llm_content
        assert "needle" in result.llm_content

    @pytest.mark.asyncio
    async def test_search_regex(self, mock_config, temp_dir):
        """Test regex pattern search."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("email: user@example.com\nphone: 123-456-7890\nother: data")

        tool = SearchFileContentTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            pattern=r"\b\d{3}-\d{3}-\d{4}\b",
            path=str(temp_dir)
        )

        assert result.success is True
        assert "test.txt" in result.llm_content
        assert "123-456-7890" in result.llm_content


class TestReplaceTool:
    """Tests for the ReplaceTool."""

    @pytest.mark.asyncio
    async def test_replace_success(self, mock_config, temp_dir):
        """Test successful content replacement."""
        test_file = temp_dir / "test.txt"
        original_content = "The quick brown fox jumps over the lazy dog."
        test_file.write_text(original_content)

        tool = ReplaceTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            file_path=str(test_file),
            old_string="lazy dog",
            new_string="sleeping cat"
        )

        assert result.success is True
        assert "Successfully replaced" in result.llm_content

        # Verify the content was actually changed
        new_content = test_file.read_text()
        assert new_content == "The quick brown fox jumps over the sleeping cat."

    @pytest.mark.asyncio
    async def test_replace_not_found(self, mock_config, temp_dir):
        """Test replacement when old string is not found."""
        test_file = temp_dir / "test.txt"
        test_file.write_text("Some content here")

        tool = ReplaceTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            file_path=str(test_file),
            old_string="nonexistent text",
            new_string="replacement"
        )

        assert result.success is False
        assert "not found" in result.error


class TestReadManyFilesTool:
    """Tests for the ReadManyFilesTool."""

    @pytest.mark.asyncio
    async def test_read_many_files_success(self, mock_config, temp_dir):
        """Test reading multiple files."""
        # Create test files
        file1 = temp_dir / "file1.txt"
        file1.write_text("Content of file 1")

        file2 = temp_dir / "file2.txt"
        file2.write_text("Content of file 2")

        tool = ReadManyFilesTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            paths=[str(file1), str(file2)]
        )

        assert result.success is True
        assert "Content of file 1" in result.llm_content
        assert "Content of file 2" in result.llm_content

    @pytest.mark.asyncio
    async def test_read_many_files_glob(self, mock_config, temp_dir):
        """Test reading multiple files with glob pattern."""
        # Create test files
        (temp_dir / "test1.txt").write_text("File 1")
        (temp_dir / "test2.txt").write_text("File 2")
        (temp_dir / "other.py").write_text("Python code")

        tool = ReadManyFilesTool(mock_config)
        context = ToolContext()

        result = await tool.execute_async(
            context,
            glob_pattern="*.txt",
            path=str(temp_dir)
        )

        assert result.success is True
        assert "File 1" in result.llm_content
        assert "File 2" in result.llm_content
        assert "Python code" not in result.llm_content
