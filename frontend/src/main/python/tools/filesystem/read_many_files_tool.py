"""
Read Many Files Tool - Python implementation.

Reads multiple files in parallel with truncation handling.
"""

import asyncio
import logging
import os
from glob import glob as glob_module
from pathlib import Path
from typing import Dict, Any, List

from tools.result import ToolResult
from tools.filesystem.file_utils import is_binary_file, is_text_file
from tools.filesystem.gitignore_utils import load_gitignore, is_ignored

logger = logging.getLogger(__name__)

# Maximum file size to read (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


async def _read_single_file(file_path: str, workspace_root: str) -> tuple[str, Dict[str, Any]]:
    """
    Read a single file and return content with metadata.
    
    Args:
        file_path: Absolute path to file
        workspace_root: Workspace root directory
        
    Returns:
        Tuple of (relative_path, result_dict) where result_dict contains:
        - content: File content or None if skipped
        - is_truncated: Whether file was truncated
        - error: Error message if failed
        - skipped: Whether file was skipped
        - reason: Reason for skipping
    """
    try:
        path = Path(file_path)
        
        # Check if binary
        if is_binary_file(str(path)):
            return (
                os.path.relpath(file_path, workspace_root),
                {
                    "content": None,
                    "is_truncated": False,
                    "error": None,
                    "skipped": True,
                    "reason": "Binary file",
                }
            )
        
        # Check file size
        file_size = path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            return (
                os.path.relpath(file_path, workspace_root),
                {
                    "content": None,
                    "is_truncated": False,
                    "error": None,
                    "skipped": True,
                    "reason": f"File too large ({file_size / (1024*1024):.1f}MB)",
                }
            )
        
        # Read file
        def _read():
            try:
                return path.read_text(encoding='utf-8')
            except UnicodeDecodeError:
                return path.read_text(encoding='utf-8', errors='replace')
        
        loop = asyncio.get_event_loop()
        content = await loop.run_in_executor(None, _read)
        
        return (
            os.path.relpath(file_path, workspace_root),
            {
                "content": content,
                "is_truncated": False,
                "error": None,
                "skipped": False,
                "reason": None,
            }
        )
    except Exception as e:
        logger.debug(f"Error reading file {file_path}: {e}")
        return (
            os.path.relpath(file_path, workspace_root),
            {
                "content": None,
                "is_truncated": False,
                "error": str(e),
                "skipped": True,
                "reason": f"Read error: {str(e)}",
            }
        )


async def read_many_files(args: Dict[str, Any]) -> ToolResult:
    """
    Read multiple files in parallel.
    
    Args:
        args: Dict with paths, include, exclude
        
    Returns:
        ToolResult with concatenated content and file lists
    """
    try:
        paths = args.get("paths")
        include = args.get("include") or []
        exclude = args.get("exclude") or []

        if not isinstance(paths, list) or not all(isinstance(item, str) for item in paths):
            return ToolResult.error_result("paths parameter is required")
        if not isinstance(include, list) or not all(isinstance(item, str) for item in include):
            return ToolResult.error_result("include parameter must be a list of strings")
        if not isinstance(exclude, list) or not all(isinstance(item, str) for item in exclude):
            return ToolResult.error_result("exclude parameter must be a list of strings")
        
        workspace_root = os.getcwd()
        
        # Collect all file paths
        all_files = set()
        
        # Process direct paths and glob patterns
        search_patterns = paths + include
        
        for pattern in search_patterns:
            if os.path.isabs(pattern):
                # Absolute path
                if os.path.exists(pattern):
                    if os.path.isfile(pattern):
                        all_files.add(pattern)
                    elif os.path.isdir(pattern):
                        # For directories, add all files recursively
                        for root, dirs, files in os.walk(pattern):
                            for file in files:
                                all_files.add(os.path.join(root, file))
                else:
                    # Try as glob pattern
                    matches = glob_module(pattern, recursive=True)
                    all_files.update(matches)
            else:
                # Relative path - resolve against workspace
                full_pattern = os.path.join(workspace_root, pattern)
                if os.path.exists(full_pattern):
                    if os.path.isfile(full_pattern):
                        all_files.add(full_pattern)
                    elif os.path.isdir(full_pattern):
                        for root, dirs, files in os.walk(full_pattern):
                            for file in files:
                                all_files.add(os.path.join(root, file))
                else:
                    # Try as glob pattern
                    matches = glob_module(full_pattern, recursive=True)
                    all_files.update(matches)
        
        # Filter files using gitignore
        gitignore_spec = load_gitignore(workspace_root)
        filtered_files = []
        skipped_files = []
        
        for file_path in all_files:
            if not os.path.isfile(file_path):
                continue
            
            # Check gitignore
            try:
                rel_path = os.path.relpath(file_path, workspace_root)
                rel_path_normalized = rel_path.replace('\\', '/')
                
                if gitignore_spec and is_ignored(rel_path_normalized, gitignore_spec):
                    skipped_files.append({
                        "path": rel_path,
                        "reason": "ignored by .gitignore",
                    })
                    continue
                
                filtered_files.append(file_path)
            except Exception:
                # Skip files we can't process
                continue
        
        # Read files in parallel
        tasks = [_read_single_file(fp, workspace_root) for fp in filtered_files]
        results = await asyncio.gather(*tasks)
        
        # Process results
        processed_files = []
        skipped_files_list = []
        content_parts = []
        
        for rel_path, result in results:
            if result["skipped"]:
                skipped_files_list.append({
                    "path": rel_path,
                    "reason": result["reason"] or result.get("error", "Unknown"),
                })
                continue
            
            if result["error"]:
                skipped_files_list.append({
                    "path": rel_path,
                    "reason": result["error"],
                })
                continue
            
            content = result["content"]
            if content is None:
                continue
            
            # Add separator
            separator = f"--- {rel_path} ---"
            file_content = content
            
            if result["is_truncated"]:
                file_content = (
                    "[WARNING: This file was truncated. "
                    "To view the full content, use the 'read_file' tool on this specific file.]\n\n"
                    f"{file_content}"
                )
            
            content_parts.append(f"{separator}\n\n{file_content}\n\n")
            processed_files.append(rel_path)
        
        # Create output
        if content_parts:
            content_parts.append("--- End of content ---")
            llm_content = "".join(content_parts)
        else:
            llm_content = "No files matching the criteria were found or all were skipped."
        
        # Create display message
        display_parts = [
            f"### ReadManyFiles Result (Target Dir: `{workspace_root}`)\n\n"
        ]
        
        if processed_files:
            display_parts.append(
                f"Successfully read and concatenated content from **{len(processed_files)} file(s)**.\n"
            )
            
            if len(processed_files) <= 10:
                display_parts.append("**Processed Files:**\n")
                for file in processed_files:
                    display_parts.append(f"- `{file}`\n")
            else:
                display_parts.append("**Processed Files (first 10 shown):**\n")
                for file in processed_files[:10]:
                    display_parts.append(f"- `{file}`\n")
                display_parts.append(
                    f"- ...and {len(processed_files) - 10} more.\n"
                )
        
        if skipped_files_list:
            if len(skipped_files_list) <= 5:
                display_parts.append(
                    f"\n**Skipped {len(skipped_files_list)} item(s):**\n"
                )
            else:
                display_parts.append(
                    f"\n**Skipped {len(skipped_files_list)} item(s) (first 5 shown):**\n"
                )
            
            for skipped in skipped_files_list[:5]:
                display_parts.append(
                    f"- `{skipped['path']}` (Reason: {skipped['reason']})\n"
                )
            
            if len(skipped_files_list) > 5:
                display_parts.append(f"- ...and {len(skipped_files_list) - 5} more.\n")
        
        return ToolResult.success_result({
            "processed_files": processed_files,
            "skipped_files": skipped_files_list,
            "total_files_attempted": len(all_files),
            "llm_content": llm_content,
            "return_display": "".join(display_parts).rstrip(),
        })
    
    except Exception as e:
        logger.error(f"Unexpected error in read_many_files: {e}", exc_info=True)
        return ToolResult.error_result(f"Unexpected error: {str(e)}")
