"""
Tool Categorization.

Defines tool domains and categories for organization and discovery.
"""
from enum import Enum


class ToolDomain(str, Enum):
    """Enumeration of tool domains."""
    COMPUTER = "computer"
    FILESYSTEM = "filesystem"
    SYSTEM = "system"
    BROWSER = "browser"
    MARKETPLACE = "marketplace"
    MEMORY = "memory"
    OTHER = "other"


class ToolCategory(str, Enum):
    """Enumeration of tool categories (more granular than domains)."""
    BROWSER = "browser"
    TERMINAL = "terminal"
    EDITOR = "editor"
    FILE_OPERATION = "file_operation"
    SYSTEM_INFO = "system_info"
    SEARCH = "search"
    UTILITY = "utility"
