"""
Filesystem Tools Package.

This package contains all filesystem-related tools for the Desktop Assistant.
"""

from .data_structures import FileEntry, GlobEntry, GrepMatch, ProcessedFileResult


# Lazy imports to avoid dependency issues during module loading
def __getattr__(name):
    """Lazy import for tools to avoid circular dependencies."""
    if name == "GlobTool":
        from .glob_tool import GlobTool

        return GlobTool
    elif name == "ListDirectoryTool":
        from .list_directory_tool import ListDirectoryTool

        return ListDirectoryTool
    elif name == "ReadFileTool":
        from .read_file_tool import ReadFileTool

        return ReadFileTool
    elif name == "ReadManyFilesTool":
        from .read_many_files_tool import ReadManyFilesTool

        return ReadManyFilesTool
    elif name == "ReplaceTool":
        from .replace_tool import ReplaceTool

        return ReplaceTool
    elif name == "SearchFileContentTool":
        from .search_file_content_tool import SearchFileContentTool

        return SearchFileContentTool
    elif name == "WriteFileTool":
        from .write_file_tool import WriteFileTool

        return WriteFileTool
    else:
        raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = [
    "FileEntry",
    "GlobEntry",
    "GrepMatch",
    "ProcessedFileResult",
]
