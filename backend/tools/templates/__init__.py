"""
Tool development templates.

This package contains templates and examples for developing new tools.
These templates serve as starting points for creating custom tools.
"""

# Import templates for easy reference
from .basic_tool_template import ToolName as BasicToolTemplate
from .filesystem_tool_template import ToolName as FilesystemToolTemplate
from .web_tool_template import ToolName as WebToolTemplate
from .advanced_tool_template import ToolName as AdvancedToolTemplate

__all__ = [
    "BasicToolTemplate",
    "FilesystemToolTemplate",
    "WebToolTemplate",
    "AdvancedToolTemplate",
]
