"""Helpers for resolving repo-local AGENTS.md prompt context."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from backend.src.core.types.schemas import LLMMessage

logger = logging.getLogger(__name__)

AGENTS_FILENAME = "AGENTS.md"
AGENTS_MD_START_MARKER = "# AGENTS.md instructions for "
AGENTS_MD_END_MARKER = "</INSTRUCTIONS>"


def build_agents_md_message(directory: Path, contents: str) -> Optional[LLMMessage]:
    """Serialize one AGENTS.md file into the Codex-style contextual user block."""
    normalized_contents = contents.strip()
    if not normalized_contents:
        return None

    return {
        "role": "user",
        "content": (
            f"{AGENTS_MD_START_MARKER}{directory}\n\n"
            f"<INSTRUCTIONS>\n{normalized_contents}\n{AGENTS_MD_END_MARKER}"
        ),
    }


def resolve_workspace_repo_instruction_messages(
    workspace_path: Optional[str],
) -> List[LLMMessage]:
    """
    Resolve AGENTS.md messages for the current workspace.

    If the workspace sits inside a git repository, include every AGENTS.md from the
    repository root down to the current workspace directory. Otherwise only check the
    workspace directory itself.
    """
    workspace_dir = _normalize_workspace_directory(workspace_path)
    if workspace_dir is None:
        return []

    messages: List[LLMMessage] = []
    for directory in _iter_instruction_directories(workspace_dir):
        agents_path = directory / AGENTS_FILENAME
        if not agents_path.is_file():
            continue
        try:
            contents = agents_path.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("Failed to read %s for prompt context: %s", agents_path, exc)
            continue
        message = build_agents_md_message(directory, contents)
        if message is not None:
            messages.append(message)

    return messages


def _normalize_workspace_directory(workspace_path: Optional[str]) -> Optional[Path]:
    if not isinstance(workspace_path, str):
        return None
    normalized = workspace_path.strip()
    if not normalized:
        return None

    try:
        resolved = Path(normalized).expanduser().resolve()
    except OSError:
        return None
    if not resolved.exists():
        return None
    if resolved.is_dir():
        return resolved
    if resolved.is_file():
        return resolved.parent
    return None


def _resolve_scope_root(workspace_dir: Path) -> Path:
    """Prefer the enclosing git root when present; otherwise scope to workspace_dir."""
    for directory in [workspace_dir, *workspace_dir.parents]:
        git_dir = directory / ".git"
        if git_dir.exists():
            return directory
    return workspace_dir


def _iter_instruction_directories(workspace_dir: Path) -> List[Path]:
    """Return instruction directories from broadest applicable scope to narrowest."""
    scope_root = _resolve_scope_root(workspace_dir)
    if not _is_relative_to(workspace_dir, scope_root):
        scope_root = workspace_dir

    directories: List[Path] = []
    cursor = workspace_dir
    while True:
        directories.append(cursor)
        if cursor == scope_root:
            break
        parent = cursor.parent
        if parent == cursor:
            break
        cursor = parent

    return list(reversed(directories))


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True
