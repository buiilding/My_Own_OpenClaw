"""
Tool development templates.

This package contains templates and examples for developing new tools.
These templates serve as starting points for creating custom tools.
"""

from .advanced_tool_template import ToolName as AdvancedToolTemplate

# Import templates for easy reference
from .basic_tool_template import ToolName as BasicToolTemplate
from .filesystem_tool_template import ToolName as FilesystemToolTemplate
from .web_tool_template import ToolName as WebToolTemplate

__all__ = [
    "BasicToolTemplate",
    "FilesystemToolTemplate",
    "WebToolTemplate",
    "AdvancedToolTemplate",
]
