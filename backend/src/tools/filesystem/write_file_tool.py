"""
Write File Tool (SDK Version).

Tool for creating/overwriting files with content.
"""
import logging
import os

from pydantic import BaseModel, ConfigDict, Field

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


class WriteFileArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_path: str = Field(
        ...,
        description="The path to the file to write (absolute or relative to workspace)",
    )
    content: str = Field(..., description="The content to write to the file")
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


class WriteFileTool(Tool[WriteFileArgs]):
    """Tool for creating/overwriting files with content."""

    name = "write_file"
    required_permissions = {Permission.WRITE_FILESYSTEM}
    category = ToolDomain.FILESYSTEM
    description = """CRITICAL: This tool should ONLY be used for creating NEW files or when a complete file rewrite is explicitly necessary. 

BEFORE USING THIS TOOL:
- ALWAYS read the existing file first using read_file if it exists
- ALWAYS use the 'replace' tool for modifying existing files instead of write_file
- ALWAYS search for relevant context using search_file_content or read related files
- NEVER use write_file to overwrite existing files unless you have read the entire file and confirmed a full rewrite is required

USE CASES:
- Creating completely new files that don't exist
- Complete file rewrites when the entire file structure needs to change (only after reading the original)

RESTRICTIONS:
- Do NOT use this tool if the file already exists and you only need to modify parts of it
- Do NOT use this tool without first reading the file and understanding its current structure
- Prefer 'replace' tool for all modifications to existing files"""
    args_model = WriteFileArgs

    async def run(self, args: WriteFileArgs, ctx: ToolContext) -> dict:
        """Execute the write_file tool."""
        try:
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
                    f"WriteFile: Resolved relative path to absolute using current dir: {file_path}"
                )

            # Get workspace context for relative path resolution
            workspace_context = ctx.services.get("workspace_context")
            if workspace_context:
                target_dir = workspace_context.workspace_path
            else:
                target_dir = ctx.workspace_root

            # Check if trying to overwrite a directory
            if os.path.exists(file_path) and os.path.isdir(file_path):
                return {
                    "error": f"Path is a directory, not a file: {file_path}",
                    "llm_content": f"Error: Path is a directory, not a file: {file_path}",
                }

            # Check if file existed before writing
            file_existed = os.path.exists(file_path)
            is_new_file = not file_existed

            # Ensure parent directory exists
            ensure_directory_exists(os.path.dirname(file_path))

            # Write the file
            try:
                with open(file_path, "w", encoding=DEFAULT_ENCODING) as f:
                    f.write(args.content)
            except OSError as e:
                return {
                    "error": f"Failed to write file: {e}",
                    "llm_content": f"Error: Failed to write file: {e}",
                }

            # Create success message
            if is_new_file:
                llm_content = (
                    f"Successfully created and wrote to new file: {file_path}."
                )
            else:
                llm_content = f"Successfully overwrote file: {file_path}."

            relative_path = shorten_path(make_relative_path(file_path, target_dir))

            return {
                "file_path": file_path,
                "is_new_file": is_new_file,
                "content_length": len(args.content),
                "llm_content": llm_content,
                "return_display": f"{'Created' if is_new_file else 'Updated'} file: {relative_path}",
            }

        except Exception as e:
            logger.error(f"Unexpected error in write_file: {e}", exc_info=True)
            return {
                "error": f"Unexpected error: {str(e)}",
                "llm_content": f"Error: Unexpected error: {str(e)}",
            }
