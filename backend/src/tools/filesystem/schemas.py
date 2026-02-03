"""
Pydantic schemas for filesystem tools.
"""
from typing import Optional
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
