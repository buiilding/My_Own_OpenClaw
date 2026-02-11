"""
Dev Tool Selection.

This module provides a lightweight, dev-oriented mechanism to filter which tool
schemas are injected into the LLM prompt (and which tool calls are accepted).

Configuration file (default):
  backend/dev/tool_selection.toml

Override path via env var:
  WINDIEOS_DEV_TOOL_SELECTION_PATH=/abs/path/to/tool_selection.toml
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import tomllib

logger = logging.getLogger(__name__)

_ENV_PATH = "WINDIEOS_DEV_TOOL_SELECTION_PATH"


def _default_selection_path() -> Path:
    # WindieOS/backend/src/tools/tool_selection.py -> parents[2] == WindieOS/backend
    return Path(__file__).resolve().parents[2] / "dev" / "tool_selection.toml"


@dataclass(frozen=True, slots=True)
class ToolSelection:
    enabled: bool
    mode: str  # "allowlist" | "denylist"
    tools: frozenset[str]

    def filter_tool_names(self, tool_names: Sequence[str]) -> List[str]:
        """Filter tool names according to selection mode (stable order)."""
        if not self.enabled:
            return list(tool_names)

        if self.mode == "allowlist":
            allow = self.tools
            return [name for name in tool_names if name in allow]

        # Default to denylist semantics.
        deny = self.tools
        return [name for name in tool_names if name not in deny]

    def filter_tool_schemas(self, tool_schemas: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Filter tool schema dicts (expects each schema to have a 'name')."""
        if not self.enabled:
            return list(tool_schemas)

        if self.mode == "allowlist":
            allow = self.tools
            return [schema for schema in tool_schemas if schema.get("name") in allow]

        deny = self.tools
        return [schema for schema in tool_schemas if schema.get("name") not in deny]


_CACHE: dict[Path, tuple[float, Optional[ToolSelection]]] = {}


def _parse_selection(data: Dict[str, Any]) -> Optional[ToolSelection]:
    enabled = bool(data.get("enabled", False))
    if not enabled:
        return None

    mode_raw = data.get("mode", "denylist")
    mode = str(mode_raw).strip().lower()
    if mode not in {"allowlist", "denylist"}:
        logger.warning("Invalid tool selection mode=%r (expected allowlist|denylist). Using denylist.", mode_raw)
        mode = "denylist"

    tools_raw = data.get("tools", [])
    tools: set[str] = set()
    if isinstance(tools_raw, (list, tuple, set)):
        for item in tools_raw:
            if isinstance(item, str) and item.strip():
                tools.add(item.strip())
            elif item is not None:
                logger.debug("Ignoring non-string tool selection entry: %r", item)
    elif tools_raw is not None:
        logger.warning("Invalid tool selection tools=%r (expected array). Ignoring.", tools_raw)

    return ToolSelection(enabled=True, mode=mode, tools=frozenset(tools))


def load_tool_selection(path: Optional[Path] = None) -> Optional[ToolSelection]:
    """
    Load tool selection config from TOML.

    Returns:
        ToolSelection if enabled; otherwise None.
    """
    if path is None:
        env_path = os.getenv(_ENV_PATH)
        path = Path(env_path).expanduser() if env_path else _default_selection_path()

    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    except Exception as e:
        logger.warning("Failed to stat tool selection file %s: %s", path, e)
        return None

    cached = _CACHE.get(path)
    if cached and cached[0] == stat.st_mtime:
        return cached[1]

    selection: Optional[ToolSelection] = None
    try:
        with path.open("rb") as f:
            data = tomllib.load(f)
        if isinstance(data, dict):
            selection = _parse_selection(data)
        else:
            logger.warning("Tool selection file %s did not parse to a dict. Ignoring.", path)
            selection = None
    except Exception as e:
        logger.warning("Failed to load tool selection file %s: %s", path, e)
        selection = None

    _CACHE[path] = (stat.st_mtime, selection)
    if selection is not None and selection.mode == "allowlist" and not selection.tools:
        logger.warning("Tool selection enabled with allowlist mode but no tools configured (0 tools allowed).")
    return selection

