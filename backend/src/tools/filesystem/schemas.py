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
