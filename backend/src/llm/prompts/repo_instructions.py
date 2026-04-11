"""Helpers for resolving active-workspace AGENTS.md prompt context."""

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

    WindieOS scopes AGENTS.md to the active workspace only. It does not walk parent
    directories or attempt to discover instructions for files edited outside the
    active workspace tree.
    """
    workspace_dir = _normalize_workspace_directory(workspace_path)
    if workspace_dir is None:
        return []

    messages: List[LLMMessage] = []
    agents_path = workspace_dir / AGENTS_FILENAME
    if not agents_path.is_file():
        return messages

    try:
        contents = agents_path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("Failed to read %s for prompt context: %s", agents_path, exc)
        return messages

    message = build_agents_md_message(workspace_dir, contents)
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
