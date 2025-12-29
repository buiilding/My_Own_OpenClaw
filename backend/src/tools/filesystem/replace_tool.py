"""
Replace Tool (SDK Version).

Tool for precise search and replace operations in files.
"""
import logging
import os
from typing import Tuple

from pydantic import BaseModel, ConfigDict, Field

from backend.src.core.utils.file_reader import read_text_file_auto_encoding
from backend.src.core.utils.file_type import DEFAULT_ENCODING
from backend.src.core.utils.path_utils import (
    ensure_directory_exists,
    make_relative_path,
    shorten_path,
)
from backend.src.core.security.policy import Permission
from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.system.shell_tool import ShellTool

logger = logging.getLogger(__name__)


class ReplaceArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(..., description="The path to the file to modify")
    old_string: str = Field(..., description="The string to search for and replace")
    new_string: str = Field(..., description="The replacement string")
    replace_all: bool = Field(
        False,
        description="If true, replace all occurrences; if false, replace only the first occurrence",
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class ReplaceTool(Tool[ReplaceArgs]):
    """Tool for precise search and replace operations in files."""

    name = "replace"
    required_permissions = {Permission.WRITE_FILESYSTEM}
    category = ToolDomain.FILESYSTEM
    description = """PREFERRED tool for modifying existing files. Performs precise, structured edits with minimal diffs.

BEFORE USING THIS TOOL:
- ALWAYS read the file first using read_file to understand its current structure
- ALWAYS search for the exact text you want to replace using search_file_content to verify it exists
- NEVER make assumptions about file content - read it first

CRITICAL REQUIREMENTS:

1. READ FIRST: You MUST have read the file using read_file before using this tool. Do not guess file contents.

2. UNIQUENESS: When replace_all=false, the old_string MUST uniquely identify the specific instance you want to change:
   - Include AT LEAST 3-5 lines of context BEFORE the change point
   - Include AT LEAST 3-5 lines of context AFTER the change point
   - Include all whitespace, indentation, and surrounding code exactly as it appears in the file

3. MINIMAL EDITS: Make the smallest possible change. Prefer multiple small replace operations over one large change.

4. VERIFICATION: Before using this tool:
   - Use search_file_content to verify the exact text exists and count occurrences
   - Read the surrounding context to ensure your change fits correctly

5. MULTIPLE INSTANCES: When you need to change multiple instances:
   - Set replace_all=true to change all occurrences at once
   - Or make separate calls for each instance with unique context

This tool enforces structured, minimal edits. If you need to rewrite large sections, read the file first and consider if write_file is truly necessary."""
    args_model = ReplaceArgs

    async def run(self, args: ReplaceArgs, ctx: ToolContext) -> dict:
        """Execute the replace tool."""
        try:
            # Validate required parameters
            if not args.file_path:
                return {
                    "error": "file_path parameter is required",
                    "llm_content": "Error: file_path parameter is required",
                }

            # Resolve relative paths to absolute paths
            session_id = ctx.session.session_id
            user_id = ctx.user.user_id
            file_path = args.file_path
            if not os.path.isabs(file_path):
                # Resolve relative path to absolute using current working directory (from shell tool)
                current_dir = ShellTool.get_current_working_directory(session_id, user_id)
                file_path = os.path.abspath(os.path.join(current_dir, file_path))
                logger.info(
                    f"Replace: Resolved relative path to absolute using current dir: {file_path}"
                )

            # Get target directory for relative path resolution
            target_dir = ShellTool.get_current_working_directory(session_id, user_id)

            # Handle file creation case
            file_exists = os.path.exists(file_path)
            if not file_exists and not args.old_string:
                # Create new file
                try:
                    ensure_directory_exists(os.path.dirname(file_path))
                    with open(file_path, "w", encoding=DEFAULT_ENCODING) as f:
                        f.write(args.new_string)
                    relative_path = shorten_path(
                        make_relative_path(file_path, target_dir)
                    )
                    return {
                        "replacements": 1,
                        "is_new_file": True,
                        "llm_content": f"Created new file: {file_path} with provided content.",
                        "return_display": f"Created new file: {relative_path}",
                    }
                except OSError as e:
                    return {
                        "error": f"Failed to create file: {e}",
                        "llm_content": f"Error: Failed to create file: {e}",
                    }

            # Handle existing file editing
            if not file_exists:
                return {
                    "error": f"File does not exist and old_string is not empty: {file_path}",
                    "llm_content": f"Error: File does not exist and old_string is not empty: {file_path}",
                }

            # Read current file content
            try:
                current_content, _ = read_text_file_auto_encoding(file_path)
            except Exception as e:
                return {
                    "error": f"Failed to read file: {e}",
                    "llm_content": f"Error: Failed to read file: {e}",
                }

            # Perform replacement
            expected_count = -1 if args.replace_all else 1
            new_content, replacements = self._perform_replacement(
                current_content, args.old_string, args.new_string, expected_count
            )

            if replacements == 0:
                return {
                    "error": "Failed to edit, could not find the string to replace",
                    "llm_content": "Failed to edit, could not find the string to replace.",
                }

            if not args.replace_all and replacements > 1:
                return {
                    "error": "Multiple matches found. Provide more unique context around the specific text you want to replace.",
                    "llm_content": "Multiple matches found. Provide more unique context around the specific text you want to replace.",
                }

            # Write back the modified content
            try:
                with open(file_path, "w", encoding=DEFAULT_ENCODING) as f:
                    f.write(new_content)
            except OSError as e:
                return {
                    "error": f"Failed to write file: {e}",
                    "llm_content": f"Error: Failed to write file: {e}",
                }

            relative_path = shorten_path(make_relative_path(file_path, target_dir))
            return {
                "replacements": replacements,
                "is_new_file": False,
                "llm_content": f"Successfully modified file: {file_path} ({replacements} replacements).",
                "return_display": f"Modified file: {relative_path} ({replacements} replacements)",
            }

        except Exception as e:
            logger.error(f"Unexpected error in replace: {e}", exc_info=True)
            return {
                "error": f"Unexpected error: {str(e)}",
                "llm_content": f"Error: Unexpected error: {str(e)}",
            }

    def _perform_replacement(
        self, content: str, old_string: str, new_string: str, expected_count: int
    ) -> Tuple[str, int]:
        """Perform the actual replacement operation."""
        # TODO: Implement fuzzy matching like Gemini CLI
        # For now, use exact string matching
        count = content.count(old_string)
        if count == 0:
            return content, 0

        if count != expected_count and expected_count != -1:  # -1 means replace all
            return content, count

        # Perform replacement
        replace_count = expected_count if expected_count > 0 else count
        new_content = content.replace(old_string, new_string, replace_count)

        return new_content, replace_count
