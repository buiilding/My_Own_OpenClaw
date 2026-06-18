"""Browser-local file helpers for sidecar browser actions."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_BROWSER_FILES_DIR = Path.home() / ".windieos" / "browser"
ENV_BROWSER_FILES_DIR = "WINDIE_BROWSER_FILES_DIR"


def browser_files_root() -> Path:
    raw = os.getenv(ENV_BROWSER_FILES_DIR, "").strip()
    root = Path(raw).expanduser() if raw else DEFAULT_BROWSER_FILES_DIR
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def resolve_browser_path(raw_path: str, *, ensure_parent: bool = False) -> Path:
    value = raw_path.strip()
    if not value:
        raise ValueError("Path must be non-empty.")
    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        raise ValueError(
            "Browser file paths must be relative to the browser file root."
        )
    root = browser_files_root()
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(
            "Browser file paths must stay under the browser file root."
        ) from exc
    if ensure_parent:
        resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def read_text(path: str) -> tuple[Path, str]:
    resolved = resolve_browser_path(path)
    return resolved, resolved.read_text(encoding="utf-8")


def write_text(
    path: str,
    content: str,
    *,
    append: bool = False,
    leading_newline: bool = False,
    trailing_newline: bool = False,
) -> tuple[Path, int]:
    resolved = resolve_browser_path(path, ensure_parent=True)
    payload = content
    if leading_newline:
        payload = "\n" + payload
    if trailing_newline:
        payload = payload + "\n"
    if append and resolved.exists():
        existing = resolved.read_text(encoding="utf-8")
        payload = existing + payload
    resolved.write_text(payload, encoding="utf-8")
    return resolved, len(payload)


def replace_text(path: str, old_string: str, new_string: str) -> tuple[Path, int]:
    resolved, content = read_text(path)
    replacements = content.count(old_string)
    if replacements == 0:
        raise ValueError("Target string not found in file.")
    resolved.write_text(content.replace(old_string, new_string), encoding="utf-8")
    return resolved, replacements
