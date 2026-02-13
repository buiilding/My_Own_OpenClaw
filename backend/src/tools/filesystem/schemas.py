"""
Pydantic schemas for filesystem tools.
"""
from typing import List, Literal, Optional
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

class ReplaceOperationArgs(BaseModel):
    """One replacement operation for batched replace calls."""
    model_config = ConfigDict(extra='forbid')

    old_string: str = Field(
        ...,
        description="The exact string to replace for this operation."
    )
    new_string: str = Field(
        ...,
        description="Replacement string for this operation."
    )
    replace_all: bool = Field(
        False,
        description="If true, replace all matches for this operation."
    )
    before_context: Optional[str] = Field(
        None,
        description="Optional exact text that must appear immediately before old_string."
    )
    after_context: Optional[str] = Field(
        None,
        description="Optional exact text that must appear immediately after old_string."
    )
    occurrence_index: Optional[int] = Field(
        None,
        ge=1,
        description="Optional 1-based match index to replace when multiple matches exist."
    )
    require_eof: bool = Field(
        False,
        description="If true, match must end at file EOF (allowing trailing newline)."
    )
    match_mode: Optional[Literal['strict', 'lenient']] = Field(
        None,
        description="Matching mode for this operation; defaults to top-level match_mode."
    )


class ReplaceArgs(BaseModel):
    """Arguments for replace tool."""
    model_config = ConfigDict(extra='forbid')

    file_path: str = Field(
        ...,
        description=(
            "The path to the file to edit (absolute path). If the file does not exist, "
            "creation is allowed only when exactly one replacement operation has old_string=''."
        )
    )
    old_string: Optional[str] = Field(
        None,
        description="Single-operation old string. Use this with new_string for legacy single replace."
    )
    new_string: Optional[str] = Field(
        None,
        description="Single-operation replacement string. Required when old_string is used."
    )
    replace_all: bool = Field(
        False,
        description="Single-operation flag: replace all matches of old_string."
    )
    before_context: Optional[str] = Field(
        None,
        description="Single-operation optional context before old_string."
    )
    after_context: Optional[str] = Field(
        None,
        description="Single-operation optional context after old_string."
    )
    occurrence_index: Optional[int] = Field(
        None,
        ge=1,
        description="Single-operation 1-based match index to replace."
    )
    require_eof: bool = Field(
        False,
        description="Single-operation EOF constraint."
    )
    match_mode: Literal['strict', 'lenient'] = Field(
        'lenient',
        description="Matching mode for single operation and default for batch operations."
    )
    replacements: Optional[List[ReplaceOperationArgs]] = Field(
        None,
        description=(
            "Optional batched replacements applied atomically in order. "
            "When provided, these operations are used instead of top-level old/new fields."
        )
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
