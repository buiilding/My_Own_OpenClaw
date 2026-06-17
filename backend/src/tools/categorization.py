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
