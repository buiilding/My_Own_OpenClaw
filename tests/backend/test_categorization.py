"""Tests for tool categorization."""

from backend.src.tools.categorization import ToolDomain


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
