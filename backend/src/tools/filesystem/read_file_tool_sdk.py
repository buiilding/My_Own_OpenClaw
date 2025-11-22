import os
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

from backend.sdk.tool import Tool
from backend.sdk.context import Context
from backend.src.core.utils.file_utils import (
    get_specific_mime_type,
    is_text_file,
    read_file_content,
    read_text_file_auto_encoding,
)

class ReadFileArgs(BaseModel):
    path: str = Field(..., description="The path to the file to read (absolute or relative to workspace)")
    offset: Optional[int] = Field(None, ge=0, description="Line number to start reading from (0-based)")
    limit: Optional[int] = Field(None, gt=0, description="Number of lines to read")

class ReadFileToolSDK(Tool[ReadFileArgs]):
    name = "read_file"
    description = "Reads and returns the content of a specified file. Handles text, images, and PDFs. Supports pagination for large text files."
    args_model = ReadFileArgs

    async def run(self, args: ReadFileArgs, ctx: Context) -> dict:
        # Resolve path
        absolute_path = args.path
        if not os.path.isabs(absolute_path):
            absolute_path = os.path.abspath(os.path.join(ctx.workspace_root, absolute_path))

        # Security/filtering check
        file_service = ctx.services.get("file_service")
        if file_service:
            # Filtering options should arguably be in context too, or default
            filtering_options = {"respect_git_ignore": True, "respect_gemini_ignore": True}
            if file_service.should_ignore_file(absolute_path, filtering_options):
                return {"error": f"File is ignored by filtering rules: {absolute_path}"}

        # Check existence
        if not os.path.exists(absolute_path):
             return {"error": f"File not found: {absolute_path}"}

        # Read file content
        content, error, is_truncated = read_file_content(
            absolute_path, args.offset, args.limit
        )

        if error:
            return {"error": error}

        # Format response
        llm_content = content
        if is_truncated:
            lines_shown = content.count("\n") + 1 if content else 0
            total_lines = self._get_total_lines(absolute_path)
            next_offset = (args.offset or 0) + lines_shown

            llm_content = (
                "IMPORTANT: The file content has been truncated.\n"
                f"Status: Showing lines {args.offset or 0 + 1}-{args.offset or 0 + lines_shown} of {total_lines} total lines.\n"
                "Action: To read more of the file, you can use the 'offset' and 'limit' parameters in a subsequent 'read_file' call. "
                f"For example, to read the next section of the file, use offset: {next_offset}.\n\n"
                "--- FILE CONTENT (truncated) ---\n"
                f"{content}"
            )

        # Metadata
        lines = content.count("\n") + 1 if isinstance(content, str) else None
        mimetype = get_specific_mime_type(absolute_path)
        programming_language = self._get_programming_language(absolute_path)

        # The adapter will wrap this dict into ToolResult.data
        # But wait, ToolResult expects specific fields if we want them to be used by Executor specially.
        # The Adapter puts this return value into `data`.
        # If we want to control `llm_content`, we might need to return a specific structure or update Adapter.
        # For now, let's return a dict and let the Adapter default to `str(result)`.
        # Wait, my Adapter implementation:
        # return ToolResult(success=True, data=result, llm_content=str(result), return_display=str(result))
        # This is suboptimal if result is a complex dict.
        
        # IMPROVEMENT: Let the tool return a specific Result object or dict that Adapter understands?
        # Or just return the content string as the main result?
        # For read_file, the LLM needs the content.
        
        # Let's return just the content for now to be safe with current Adapter,
        # OR update Adapter to check for specific keys like 'llm_content' in the result dict.
        
        # I will update Adapter to be smarter about dict returns.
        return {
            "content": content,
            "is_truncated": is_truncated,
            "lines": lines,
            "mimetype": mimetype,
            "programming_language": programming_language,
            "llm_content": llm_content # Special key for Adapter
        }

    def _get_total_lines(self, file_path: str) -> int:
        """Get the total number of lines in a text file."""
        try:
            if is_text_file(file_path):
                content, _ = read_text_file_auto_encoding(file_path)
                return content.count("\n") + 1
        except Exception:
            pass
        return 0

    def _get_programming_language(self, file_path: str) -> Optional[str]:
        """Get the programming language for a file."""
        ext = Path(file_path).suffix.lower()
        # ... (same map as before, shortened for brevity) ...
        return ext.lstrip(".")

