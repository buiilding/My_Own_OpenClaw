"""
Read Many Files Tool (SDK Version).

Tool for reading multiple files by paths/glob patterns.
"""
import logging
import os
from glob import glob as glob_module
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from backend.src.tools.system.shell_tool import ShellTool
from backend.src.core.utils.file_utils import (
    FileType,
    detect_file_type,
    make_relative_path,
    read_file_content,
)

logger = logging.getLogger(__name__)


class ReadManyFilesArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    paths: List[str] = Field(..., description="List of file paths or glob patterns to read")
    include: Optional[List[str]] = Field(None, description="Additional glob patterns to include")
    exclude: Optional[List[str]] = Field(None, description="Glob patterns to exclude (reserved for future use)")
    useDefaultExcludes: Optional[bool] = Field(None, description="Whether to use default excludes (reserved for future use)")
    file_filtering_options: Optional[Dict[str, bool]] = Field(None, description="File filtering options (respect_git_ignore, respect_gemini_ignore)")


class ReadManyFilesTool(Tool[ReadManyFilesArgs]):
    """Tool for reading multiple files by paths/glob patterns."""
    
    name = "read_many_files"
    description = "Reads content from multiple files specified by paths or glob patterns within a configured target directory. For text files, it concatenates their content into a single string. It is primarily designed for text-based files. However, it can also process image (e.g., .png, .jpg) and PDF (.pdf) files if their file names or extensions are explicitly included in the 'paths' argument."
    args_model = ReadManyFilesArgs

    async def run(self, args: ReadManyFilesArgs, ctx: Context) -> dict:
        """Execute the read_many_files tool."""
        try:
            include = args.include or []
            file_filtering_options = args.file_filtering_options or {}

            if not args.paths:
                return {
                    "error": "paths parameter is required",
                    "llm_content": "Error: paths parameter is required"
                }

            # Get target directory for relative path resolution
            target_dir = ShellTool.get_current_working_directory()

            # Collect all file paths
            all_files = set()

            # Process direct paths and glob patterns
            search_patterns = args.paths + include
            logger.info(
                f"ReadManyFiles: Processing {len(search_patterns)} patterns: {search_patterns}"
            )

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
                    full_pattern = os.path.join(target_dir, pattern)
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

            workspace_files = list(all_files)
            skipped_files = []

            # Apply file filtering
            file_service = ctx.services.get("file_service")
            relative_paths = [
                make_relative_path(p, target_dir) for p in workspace_files
            ]

            filtering_options = {
                "respect_git_ignore": file_filtering_options.get(
                    "respect_git_ignore", True
                ),
                "respect_gemini_ignore": file_filtering_options.get(
                    "respect_gemini_ignore", True
                ),
            }

            logger.info(
                f"ReadManyFiles: Filtering {len(relative_paths)} relative paths: {relative_paths[:5]}"
            )
            
            if file_service:
                filtered_paths, ignored_count = file_service.filter_files_with_report(
                    relative_paths, filtering_options
                )
            else:
                filtered_paths = relative_paths
                ignored_count = 0
                
            logger.info(
                f"ReadManyFiles: After filtering: {len(filtered_paths)} files passed, {ignored_count} ignored"
            )

            if ignored_count > 0:
                skipped_files.append(
                    {
                        "path": f"{ignored_count} file(s)",
                        "reason": "ignored by project ignore files",
                    }
                )

            # Convert back to absolute paths
            filtered_absolute_paths = [
                os.path.join(target_dir, p) for p in filtered_paths
            ]
            logger.info(
                f"ReadManyFiles: Processing {len(filtered_absolute_paths)} files: {filtered_absolute_paths[:3]}"
            )

            # Process files
            processed_files = []
            content_parts = []

            for file_path in filtered_absolute_paths:
                try:
                    logger.info(f"ReadManyFiles: Reading file: {file_path}")
                    file_type = detect_file_type(file_path)
                    logger.info(
                        f"ReadManyFiles: Detected file type: {file_type} for {file_path}"
                    )

                    # Handle image/PDF files specially
                    if file_type in [FileType.IMAGE, FileType.PDF]:
                        # Check if explicitly requested
                        explicitly_requested = any(
                            file_path.endswith(ext) or ext in file_path
                            for pattern in args.paths + include
                            for ext in [
                                ".png",
                                ".jpg",
                                ".jpeg",
                                ".gif",
                                ".webp",
                                ".svg",
                                ".bmp",
                                ".pdf",
                            ]
                        )

                        if not explicitly_requested:
                            skipped_files.append(
                                {
                                    "path": make_relative_path(file_path, target_dir),
                                    "reason": "asset file (image/pdf) was not explicitly requested by name or extension",
                                }
                            )
                            continue

                    # Read file content
                    logger.info(
                        f"ReadManyFiles: Calling read_file_content for {file_path}"
                    )
                    content, error, is_truncated = read_file_content(file_path)
                    logger.info(
                        f"ReadManyFiles: Read result - error: {error}, is_truncated: {is_truncated}, content_length: {len(content) if isinstance(content, str) else 'binary'}"
                    )

                    if error:
                        skipped_files.append(
                            {
                                "path": make_relative_path(file_path, target_dir),
                                "reason": f"Read error: {error}",
                            }
                        )
                        continue

                    relative_path = make_relative_path(file_path, target_dir)

                    if isinstance(content, str):
                        # Text file - add separator
                        separator = f"--- {file_path} ---"
                        file_content = content
                        if is_truncated:
                            file_content = f"[WARNING: This file was truncated. To view the full content, use the 'read_file' tool on this specific file.]\n\n{file_content}"

                        content_parts.append(f"{separator}\n\n{file_content}\n\n")
                        logger.info(
                            f"ReadManyFiles: Added text content for {file_path}, length: {len(file_content)}"
                        )
                    else:
                        # Binary file (image/PDF) - add without separator
                        content_parts.append(content)
                        logger.info(
                            f"ReadManyFiles: Added binary content for {file_path}"
                        )

                    processed_files.append(relative_path)
                    logger.info(f"ReadManyFiles: Successfully processed {file_path}")

                except Exception as e:
                    skipped_files.append(
                        {
                            "path": make_relative_path(file_path, target_dir),
                            "reason": f"Unexpected error: {str(e)}",
                        }
                    )

            # Create output
            if content_parts:
                content_parts.append("--- End of content ---")
                llm_content = "".join(content_parts)
                logger.info(
                    f"ReadManyFiles: Created llm_content with {len(content_parts)} parts, total length: {len(llm_content)}"
                )
            else:
                llm_content = (
                    "No files matching the criteria were found or all were skipped."
                )
                logger.warning("ReadManyFiles: No content parts created!")

            # Create display message
            display_parts = [
                f"### ReadManyFiles Result (Target Dir: `{target_dir}`)\n\n"
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

            if skipped_files:
                if len(skipped_files) <= 5:
                    display_parts.append(
                        f"\n**Skipped {len(skipped_files)} item(s):**\n"
                    )
                else:
                    display_parts.append(
                        f"\n**Skipped {len(skipped_files)} item(s) (first 5 shown):**\n"
                    )

                for skipped in skipped_files[:5]:
                    display_parts.append(
                        f"- `{skipped['path']}` (Reason: {skipped['reason']})\n"
                    )

                if len(skipped_files) > 5:
                    display_parts.append(f"- ...and {len(skipped_files) - 5} more.\n")

            return {
                "processed_files": processed_files,
                "skipped_files": skipped_files,
                "total_files_attempted": len(workspace_files),
                "llm_content": llm_content,
                "return_display": "".join(display_parts).rstrip()
            }

        except Exception as e:
            logger.error(f"Unexpected error in read_many_files: {e}", exc_info=True)
            return {
                "error": f"Unexpected error: {str(e)}",
                "llm_content": f"Error: Unexpected error: {str(e)}"
            }
