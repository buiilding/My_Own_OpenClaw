"""
Pydantic schemas for filesystem tools.
"""
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

# --- Read File Schemas ---

class ReadFileArgs(BaseModel):
    """Arguments for read file tool."""
    model_config = ConfigDict(extra='forbid')
    
    file_path: str = Field(
        ...,
        description="The path to the file to read (absolute path)"
    )
    offset: Optional[int] = Field(
        None, ge=0, description="Line number to start reading from (0-based)"
    )
    limit: Optional[int] = Field(None, gt=0, description="Number of lines to read")

    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- Write File Schemas ---

class WriteFileArgs(BaseModel):
    """Arguments for write file tool."""
    model_config = ConfigDict(extra='forbid')
    
    file_path: str = Field(
        ...,
        description="The path to the file to write (absolute path)"
    )
    content: str = Field(
        ...,
        description="The full content to write to the file. This will overwrite existing content."
    )
    
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- List Directory Schemas ---

class ListDirectoryArgs(BaseModel):
    """Arguments for list directory tool."""
    model_config = ConfigDict(extra='forbid')
    
    path: str = Field(
        ...,
        description="The absolute path to the directory to list."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- Glob Schemas ---

class GlobArgs(BaseModel):
    """Arguments for glob tool."""
    model_config = ConfigDict(extra='forbid')

    pattern: str = Field(
        ..., description="Glob pattern to search for (e.g., 'src/**/*.ts', '**/*.md')"
    )
    path: Optional[str] = Field(
        None, description="Directory path to search in (defaults to current working directory)"
    )
    case_sensitive: Optional[bool] = Field(
        None, description="Whether pattern matching is case sensitive (reserved for future use)"
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- Replace Schemas ---

class ReplaceArgs(BaseModel):
    """Arguments for replace tool."""
    model_config = ConfigDict(extra='forbid')

    file_path: str = Field(
        ...,
        description="The path to the file to edit (absolute path). If the file does not exist and old_string is empty, create it with new_string."
    )
    old_string: str = Field(
        ...,
        description="The exact string to replace. Must be unique unless replace_all=true. Empty string is allowed only when creating a new file."
    )
    new_string: str = Field(
        ...,
        description="Replacement string. If creating a new file, this becomes the file content."
    )
    replace_all: bool = Field(
        False,
        description="If true, replace all occurrences; otherwise replace exactly one unique occurrence."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- Search File Content Schemas ---

class SearchFileContentArgs(BaseModel):
    """Arguments for search_file_content tool."""
    model_config = ConfigDict(extra='forbid')

    pattern: str = Field(
        ...,
        description="Regex pattern to search for in file contents."
    )
    path: Optional[str] = Field(
        None,
        description="Directory path to search in (absolute or relative to current working directory). Defaults to current working directory."
    )
    include: Optional[str] = Field(
        None,
        description="Optional glob filter (e.g., '**/*.py') applied by the search implementation."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- Read Many Files Schemas ---

class ReadManyFilesArgs(BaseModel):
    """Arguments for read_many_files tool."""
    model_config = ConfigDict(extra='forbid')

    paths: List[str] = Field(
        ...,
        description="List of file paths, directory paths, or glob patterns (absolute or relative to current working directory)."
    )
    include: List[str] = Field(
        default_factory=list,
        description="Additional file paths or glob patterns to include."
    )
    exclude: List[str] = Field(
        default_factory=list,
        description="File paths or glob patterns to exclude (may be ignored by the current sidecar implementation)."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
