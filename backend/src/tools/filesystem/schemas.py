"""
Pydantic schemas for filesystem tools.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.src.tools.schema_fields import explanation_field

# --- Read File Schemas ---


class ReadFileArgs(BaseModel):
    """Arguments for read file tool."""

    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(
        ...,
        description=(
            "Path to the file to read. Absolute paths are allowed, and relative paths "
            "resolve from the selected workspace folder when available; otherwise they "
            "resolve from the OS user home directory."
        ),
    )
    offset: Optional[int] = Field(
        None,
        ge=0,
        description="0-based line offset to start reading from (defaults to 0)",
    )
    limit: Optional[int] = Field(
        None,
        gt=0,
        description="Maximum number of lines to read (defaults to 2000 when omitted)",
    )

    explanation: str = explanation_field()


# --- Replace Schemas ---


class ReplaceOperationArgs(BaseModel):
    """One replacement operation for batched replace calls."""

    model_config = ConfigDict(extra="forbid")

    old_string: str = Field(
        ..., description="The exact string to replace for this operation."
    )
    new_string: str = Field(
        ...,
        description=(
            "Replacement string for this operation. Keep payloads focused; split large "
            "edits across multiple focused edit calls."
        ),
    )
    replace_all: bool = Field(
        False, description="If true, replace all matches for this operation."
    )
    before_context: Optional[str] = Field(
        None,
        description="Optional exact text that must appear immediately before old_string.",
    )
    after_context: Optional[str] = Field(
        None,
        description="Optional exact text that must appear immediately after old_string.",
    )
    occurrence_index: Optional[int] = Field(
        None,
        ge=1,
        description="Optional 1-based match index to replace when multiple matches exist.",
    )
    require_eof: bool = Field(
        False,
        description="If true, match must end at file EOF (allowing trailing newline).",
    )
    match_mode: Optional[Literal["strict", "lenient"]] = Field(
        None,
        description="Matching mode for this operation; defaults to top-level match_mode.",
    )


class ReplacePatchChunkArgs(BaseModel):
    """One structured patch chunk for apply_patch-style ordered updates."""

    model_config = ConfigDict(extra="forbid")

    change_context: Optional[str] = Field(
        None,
        description="Optional single-line context anchor. Matching starts after this line.",
    )
    old_lines: List[str] = Field(
        ...,
        description="Exact old lines to replace (line content only; no newline characters).",
    )
    new_lines: List[str] = Field(
        ..., description="Replacement lines (line content only; no newline characters)."
    )
    is_end_of_file: bool = Field(
        False, description="If true, old_lines must match at end-of-file."
    )


class ReplaceArgs(BaseModel):
    """Arguments for replace tool."""

    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(
        ...,
        description=(
            "Path to the file to edit. Absolute paths are allowed, and relative paths resolve "
            "from the selected workspace folder when available; otherwise they resolve from the "
            "OS user home directory. If the file does not exist, creation is allowed only when "
            "exactly one replacement operation has old_string=''."
        ),
    )
    match_mode: Literal["strict", "lenient"] = Field(
        "lenient",
        description="Default matching mode for replacement operations.",
    )
    replacements: Optional[List[ReplaceOperationArgs]] = Field(
        None,
        description=(
            "Optional batched replacements applied atomically in order. "
            "Use a one-item list for a single edit."
        ),
    )
    patch_chunks: Optional[List[ReplacePatchChunkArgs]] = Field(
        None,
        description=(
            "Optional ordered update chunks for robust multi-region edits. "
            "When provided, patch_chunks cannot be combined with replacements. "
            "Prefer multiple focused chunks/calls over one oversized payload."
        ),
    )
    explanation: str = explanation_field()

    @model_validator(mode="after")
    def validate_single_edit_mode(self) -> "ReplaceArgs":
        replacements_used = self.replacements is not None
        patch_chunks_used = self.patch_chunks is not None

        mode_count = int(replacements_used) + int(patch_chunks_used)
        if mode_count != 1:
            raise ValueError(
                "replace requires exactly one edit mode: replacements or patch_chunks"
            )

        if self.replacements is not None and len(self.replacements) == 0:
            raise ValueError("replacements must be a non-empty list when provided")
        if self.patch_chunks is not None and len(self.patch_chunks) == 0:
            raise ValueError("patch_chunks must be a non-empty list when provided")
        return self
