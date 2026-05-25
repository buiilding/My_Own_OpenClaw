"""
Pydantic schemas for filesystem tools.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator

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
    old_string: Optional[str] = Field(
        None,
        description="Single-operation old string. Use this with new_string for legacy single replace.",
    )
    new_string: Optional[str] = Field(
        None,
        description=(
            "Single-operation replacement string. Required when old_string is used. "
            "Do not send giant payloads in one call; chunk large edits across multiple calls."
        ),
    )
    replace_all: bool = Field(
        False, description="Single-operation flag: replace all matches of old_string."
    )
    before_context: Optional[str] = Field(
        None, description="Single-operation optional context before old_string."
    )
    after_context: Optional[str] = Field(
        None, description="Single-operation optional context after old_string."
    )
    occurrence_index: Optional[int] = Field(
        None, ge=1, description="Single-operation 1-based match index to replace."
    )
    require_eof: bool = Field(False, description="Single-operation EOF constraint.")
    match_mode: Literal["strict", "lenient"] = Field(
        "lenient",
        description="Matching mode for single operation and default for batch operations.",
    )
    replacements: Optional[List[ReplaceOperationArgs]] = Field(
        None,
        description=(
            "Optional batched replacements applied atomically in order. "
            "When provided, these operations are used instead of top-level old/new fields."
        ),
    )
    patch_chunks: Optional[List[ReplacePatchChunkArgs]] = Field(
        None,
        description=(
            "Optional ordered update chunks for robust multi-region edits. "
            "When provided, patch_chunks cannot be combined with old_string/new_string/replacements. "
            "Prefer multiple focused chunks/calls over one oversized payload."
        ),
    )
    explanation: str = explanation_field()

    @model_validator(mode="after")
    def validate_single_edit_mode(self) -> "ReplaceArgs":
        top_level_fields_used = (
            self.old_string is not None
            or self.new_string is not None
            or self.replace_all is True
            or self.before_context is not None
            or self.after_context is not None
            or self.occurrence_index is not None
            or self.require_eof is True
        )
        replacements_used = self.replacements is not None
        patch_chunks_used = self.patch_chunks is not None

        mode_count = sum(
            int(mode_used)
            for mode_used in (
                top_level_fields_used,
                replacements_used,
                patch_chunks_used,
            )
        )
        if mode_count != 1:
            raise ValueError(
                "replace requires exactly one edit mode: old_string/new_string, "
                "replacements, or patch_chunks"
            )

        if top_level_fields_used and (
            self.old_string is None or self.new_string is None
        ):
            raise ValueError(
                "old_string and new_string are both required for top-level replace mode"
            )
        if self.replacements is not None and len(self.replacements) == 0:
            raise ValueError("replacements must be a non-empty list when provided")
        if self.patch_chunks is not None and len(self.patch_chunks) == 0:
            raise ValueError("patch_chunks must be a non-empty list when provided")
        return self
