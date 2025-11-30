"""
Path manipulation utilities.

Provides utilities for path operations and directory management.
"""
from pathlib import Path
from typing import Union


def ensure_directory_exists(dir_path: Union[str, Path]) -> None:
    """
    Ensure that a directory exists, creating it if necessary.

    Args:
        dir_path: Path to the directory
    """
    Path(dir_path).mkdir(parents=True, exist_ok=True)


def is_within_directory(
    file_path: Union[str, Path], directory: Union[str, Path]
) -> bool:
    """
    Check if a file path is within a given directory.

    Args:
        file_path: Path to the file
        directory: Path to the directory

    Returns:
        True if the file is within the directory, False otherwise
    """
    try:
        file_path = Path(file_path).resolve()
        directory = Path(directory).resolve()
        return file_path.is_relative_to(directory)
    except (OSError, ValueError):
        return False


def make_relative_path(
    absolute_path: Union[str, Path], base_dir: Union[str, Path]
) -> str:
    """
    Make a path relative to a base directory.

    Args:
        absolute_path: Absolute path to convert
        base_dir: Base directory

    Returns:
        Relative path string
    """
    try:
        return str(Path(absolute_path).relative_to(base_dir))
    except ValueError:
        # If the path is not relative to base_dir, return the absolute path
        return str(absolute_path)


def shorten_path(path: Union[str, Path], max_length: int = 50) -> str:
    """
    Shorten a path for display purposes.

    Args:
        path: Path to shorten
        max_length: Maximum length of the result

    Returns:
        Shortened path string
    """
    path_str = str(path)
    if len(path_str) <= max_length:
        return path_str

    # Try to keep the filename and some directory context
    path_obj = Path(path)
    filename = path_obj.name

    if len(filename) > max_length - 3:
        return "..." + filename[-(max_length - 3) :]

    remaining_length = max_length - len(filename) - 3  # 3 for "..."
    parent_str = str(path_obj.parent)

    if len(parent_str) <= remaining_length:
        return "..." + parent_str + "/" + filename
    else:
        return "..." + parent_str[-remaining_length:] + "/" + filename
