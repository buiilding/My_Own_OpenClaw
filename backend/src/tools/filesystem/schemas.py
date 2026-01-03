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
