"""
Write File Tool - Python implementation.

HARD GUARDRAIL: Fails if file exists to force agent to use 'replace' tool for modifications.
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import Dict, Any

from tools.result import ToolResult

logger = logging.getLogger(__name__)


def _get_workspace_root() -> str:
    """
    Get workspace root directory.
    
    For now, uses current working directory. Could be made configurable.
    """
    return os.getcwd()


def _is_within_workspace(file_path: str) -> bool:
    """
    Validate that file path is within workspace boundaries.
    
    Args:
        file_path: Absolute file path
        
    Returns:
        True if path is within workspace, False otherwise
    """
    try:
        workspace_root = _get_workspace_root()
        file_abs = os.path.abspath(file_path)
        workspace_abs = os.path.abspath(workspace_root)
        
        # Check if file path is within workspace
        return file_abs.startswith(workspace_abs + os.sep) or file_abs == workspace_abs
    except Exception:
        return False


async def write_file(args: Dict[str, Any]) -> ToolResult:
    """
    Write file contents with workspace validation and hard guardrail.
    
    HARD GUARDRAIL: Fails if file exists to force agent to use 'replace' tool.
    
    Args:
        args: Dictionary with 'file_path' and 'content'
        
    Returns:
        ToolResult with write result
    """
    file_path = args.get("file_path")
    content = args.get("content")
    
    if not file_path:
        return ToolResult.error_result("file_path is required")
    
    if content is None:
        return ToolResult.error_result("content is required")
    
    try:
        path = Path(file_path)
        
        # Validate absolute path
        if not path.is_absolute():
            return ToolResult.error_result(f"File path must be absolute: {file_path}")
        
        # Validate workspace boundary
        if not _is_within_workspace(str(path)):
            return ToolResult.error_result(
                f"File path is outside workspace boundaries: {file_path}. "
                f"Workspace root: {_get_workspace_root()}"
            )
        
        # HARD GUARDRAIL: Fail if file exists
        if path.exists():
            # Exception: Allow if file is empty (edge case)
            if path.stat().st_size == 0:
                logger.info(f"Allowing write to empty file: {file_path}")
            else:
                return ToolResult.error_result(
                    f"File already exists: {file_path}. "
                    f"Use the 'replace' tool to modify existing files."
                )
        
        # Ensure directory exists
        path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write file
        def _write_file():
            path.write_text(content, encoding="utf-8")
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _write_file)
        
        # Calculate bytes written
        bytes_written = len(content.encode("utf-8"))
        
        return ToolResult.success_result({
            "file_path": str(path),
            "bytes_written": bytes_written,
            "llm_content": f"Successfully wrote to {file_path}",
        })
    except Exception as e:
        logger.error(f"Error writing file: {e}", exc_info=True)
        return ToolResult.error_result(f"Failed to write file: {str(e)}")
