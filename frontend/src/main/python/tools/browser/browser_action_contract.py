"""Canonical browser action contract imported from the backend source of truth."""

from __future__ import annotations

import sys
from pathlib import Path


def _ensure_repo_root_on_path() -> None:
    repo_root = Path(__file__).resolve().parents[7]
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)


_ensure_repo_root_on_path()

from backend.src.tools.browser.schemas import (  # noqa: E402
    BROWSER_ACTION_CONTRACTS,
    BROWSER_ACTION_CONTRACTS_BY_NAME,
    BROWSER_ACTIONS_REQUIRING_CONNECTION,
    BROWSER_MODEL_VISIBLE_ACTIONS,
    BROWSER_RUNTIME_ACTIONS,
)
from backend.src.tools.browser.schema_types import BROWSER_CANONICAL_ACTIONS  # noqa: E402

BROWSER_ALL_ACTIONS = frozenset(BROWSER_CANONICAL_ACTIONS)

__all__ = [
    "BROWSER_ACTION_CONTRACTS",
    "BROWSER_ACTION_CONTRACTS_BY_NAME",
    "BROWSER_ACTIONS_REQUIRING_CONNECTION",
    "BROWSER_ALL_ACTIONS",
    "BROWSER_CANONICAL_ACTIONS",
    "BROWSER_MODEL_VISIBLE_ACTIONS",
    "BROWSER_RUNTIME_ACTIONS",
]
