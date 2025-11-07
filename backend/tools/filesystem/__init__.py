"""
Filesystem Tools Package.

This package contains all filesystem-related tools for the Desktop Assistant.
"""

from .data_structures import FileEntry, GlobEntry, GrepMatch, ProcessedFileResult
from .glob_tool import GlobTool
from .list_directory_tool import ListDirectoryTool
from .read_file_tool import ReadFileTool
from .read_many_files_tool import ReadManyFilesTool
from .replace_tool import ReplaceTool
from .search_file_content_tool import SearchFileContentTool
from .write_file_tool import WriteFileTool

__all__ = [
    "FileEntry",
    "GlobEntry", 
    "GrepMatch",
    "ProcessedFileResult",
    "GlobTool",
    "ListDirectoryTool",
    "ReadFileTool",
    "ReadManyFilesTool",
    "ReplaceTool",
    "SearchFileContentTool",
    "WriteFileTool",
]
