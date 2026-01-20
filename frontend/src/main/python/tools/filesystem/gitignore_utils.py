"""
Gitignore utility functions using pathspec library.
"""

import os
import logging
from pathlib import Path
from typing import Optional

try:
    import pathspec
except ImportError:
    pathspec = None
    logging.warning("pathspec not available - gitignore filtering will be disabled")

logger = logging.getLogger(__name__)


def load_gitignore(root_path: str) -> Optional['pathspec.PathSpec']:
    """
    Load .gitignore file using pathspec library.
    
    Args:
        root_path: Root directory path to search for .gitignore
        
    Returns:
        PathSpec object if .gitignore found, None otherwise
    """
    if pathspec is None:
        return None
    
    try:
        gitignore_path = os.path.join(root_path, '.gitignore')
        if os.path.exists(gitignore_path):
            with open(gitignore_path, 'r', encoding='utf-8') as f:
                spec = pathspec.PathSpec.from_lines('gitwildmatch', f)
            return spec
    except Exception as e:
        logger.warning(f"Error loading .gitignore from {root_path}: {e}")
    
    return None


def find_gitignore_specs(directory_path: str) -> list:
    """
    Find all .gitignore files in the directory tree.
    
    Args:
        directory_path: Directory to search
        
    Returns:
        List of (directory_path, PathSpec) tuples
    """
    if pathspec is None:
        return []
    
    specs = []
    try:
        path = Path(directory_path)
        # Walk up the directory tree to find all .gitignore files
        current = path.resolve()
        while current != current.parent:  # Stop at root
            gitignore_path = current / '.gitignore'
            if gitignore_path.exists():
                try:
                    with open(gitignore_path, 'r', encoding='utf-8') as f:
                        spec = pathspec.PathSpec.from_lines('gitwildmatch', f)
                        specs.append((str(current), spec))
                except Exception as e:
                    logger.warning(f"Error loading .gitignore from {gitignore_path}: {e}")
            current = current.parent
    except Exception as e:
        logger.warning(f"Error finding .gitignore files: {e}")
    
    return specs


def is_ignored(relative_path: str, gitignore_spec: Optional['pathspec.PathSpec']) -> bool:
    """
    Check if a file path matches gitignore patterns.
    
    Args:
        relative_path: Relative file path (from gitignore root)
        gitignore_spec: PathSpec object from load_gitignore
        
    Returns:
        True if file should be ignored, False otherwise
    """
    if pathspec is None or gitignore_spec is None:
        return False
    
    try:
        # Normalize path separators for cross-platform compatibility
        normalized_path = relative_path.replace('\\', '/')
        return gitignore_spec.match_file(normalized_path)
    except Exception as e:
        logger.warning(f"Error checking gitignore for {relative_path}: {e}")
        return False


def is_ignored_by_any(relative_path: str, specs: list) -> bool:
    """
    Check if a file path matches any of the provided gitignore specs.
    
    Args:
        relative_path: Relative file path
        specs: List of (directory_path, PathSpec) tuples
        
    Returns:
        True if file should be ignored by any spec, False otherwise
    """
    if not specs:
        return False
    
    # Normalize path
    normalized_path = relative_path.replace('\\', '/')
    
    for dir_path, spec in specs:
        try:
            # Make path relative to this gitignore's directory
            if normalized_path.startswith(dir_path.replace('\\', '/')):
                rel_to_gitignore = normalized_path[len(dir_path.replace('\\', '/')):].lstrip('/')
                if spec.match_file(rel_to_gitignore):
                    return True
        except Exception as e:
            logger.warning(f"Error checking gitignore spec: {e}")
    
    return False
