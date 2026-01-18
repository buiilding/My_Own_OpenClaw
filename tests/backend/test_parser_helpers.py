"""
Test helpers for ResponseParser tests.

Provides mock ToolRegistry and helper functions for creating ResponseParser instances
with required dependencies for testing.
"""

from typing import List
from unittest.mock import Mock

from backend.src.llm.parser import ResponseParser
from backend.src.core.config.models import AppConfig, SecurityLimits


class MockToolRegistry:
    """Mock ToolRegistry for testing."""
    
    def __init__(self, tool_names: List[str]):
        """
        Initialize mock tool registry.
        
        Args:
            tool_names: List of tool names to include in the registry
        """
        self.tool_names_list = tool_names
    
    def get_tool_names(self) -> List[str]:
        """Return the list of tool names."""
        return self.tool_names_list


def create_test_parser(tool_names: List[str] = None, config: AppConfig = None) -> ResponseParser:
    """
    Create a ResponseParser instance for testing with mock dependencies.
    
    Args:
        tool_names: List of tool names to include in mock registry.
                   Defaults to common tool names used in tests.
        config: Optional AppConfig instance. Defaults to config with default SecurityLimits.
    
    Returns:
        ResponseParser instance ready for testing
    """
    # Default tool names used in tests
    if tool_names is None:
        tool_names = [
            "write_file",
            "read_file",
            "read_many_files",
            "replace",
            "list_directory",
            "glob",
            "search_file_content",
            "screenshot",
            "keyboard_control",
            "mouse_control",
            "scroll_control",
            "get_open_windows",
            "get_system_stats",
            "run_shell_command",
        ]
    
    # Create mock tool registry
    mock_registry = MockToolRegistry(tool_names)
    
    # Create config if not provided
    if config is None:
        config = AppConfig(security_limits=SecurityLimits())
    
    return ResponseParser(
        config=config,
        tool_registry=mock_registry,
    )
