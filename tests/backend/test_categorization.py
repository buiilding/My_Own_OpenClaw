"""Tests for tool categorization."""
import pytest

from backend.src.tools.categorization import ToolDomain, ToolCategory


class TestToolDomain:
    """Tests for ToolDomain enum."""

    def test_enum_values(self):
        assert ToolDomain.COMPUTER == "computer"
        assert ToolDomain.FILESYSTEM == "filesystem"
        assert ToolDomain.SYSTEM == "system"
        assert ToolDomain.BROWSER == "browser"
        assert ToolDomain.MARKETPLACE == "marketplace"
        assert ToolDomain.MEMORY == "memory"
        assert ToolDomain.OTHER == "other"

    def test_enum_string_comparison(self):
        assert ToolDomain.COMPUTER == "computer"
        assert ToolDomain.FILESYSTEM == "filesystem"

    def test_enum_membership(self):
        assert "computer" in [e.value for e in ToolDomain]
        assert "browser" in [e.value for e in ToolDomain]

    def test_enum_iteration(self):
        domains = list(ToolDomain)
        assert len(domains) == 7
        assert ToolDomain.COMPUTER in domains


class TestToolCategory:
    """Tests for ToolCategory enum."""

    def test_enum_values(self):
        assert ToolCategory.BROWSER == "browser"
        assert ToolCategory.TERMINAL == "terminal"
        assert ToolCategory.EDITOR == "editor"
        assert ToolCategory.FILE_OPERATION == "file_operation"
        assert ToolCategory.SYSTEM_INFO == "system_info"
        assert ToolCategory.SEARCH == "search"
        assert ToolCategory.UTILITY == "utility"

    def test_enum_string_comparison(self):
        assert ToolCategory.BROWSER == "browser"
        assert ToolCategory.TERMINAL == "terminal"

    def test_enum_membership(self):
        assert "browser" in [e.value for e in ToolCategory]
        assert "file_operation" in [e.value for e in ToolCategory]

    def test_enum_iteration(self):
        categories = list(ToolCategory)
        assert len(categories) == 7
        assert ToolCategory.BROWSER in categories
