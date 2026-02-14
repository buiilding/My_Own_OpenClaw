"""Role-based browser snapshot helpers ported from OpenClaw semantics."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple


INTERACTIVE_ROLES: Set[str] = {
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "searchbox",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "treeitem",
}

CONTENT_ROLES: Set[str] = {
    "heading",
    "cell",
    "gridcell",
    "columnheader",
    "rowheader",
    "listitem",
    "article",
    "region",
    "main",
    "navigation",
}

STRUCTURAL_ROLES: Set[str] = {
    "generic",
    "group",
    "list",
    "table",
    "row",
    "rowgroup",
    "grid",
    "treegrid",
    "menu",
    "menubar",
    "toolbar",
    "tablist",
    "tree",
    "directory",
    "document",
    "application",
    "presentation",
    "none",
}


@dataclass
class RoleRef:
    role: str
    name: Optional[str] = None
    nth: Optional[int] = None


@dataclass
class RoleSnapshotStats:
    lines: int
    chars: int
    refs: int
    interactive: int


@dataclass
class RoleSnapshotOptions:
    interactive: Optional[bool] = None
    max_depth: Optional[int] = None
    compact: Optional[bool] = None


def parse_role_ref(raw: str) -> Optional[str]:
    """Parse role refs like e1, @e1, or ref=e1."""
    trimmed = str(raw or "").strip()
    if not trimmed:
        return None
    normalized = trimmed
    if normalized.startswith("@"):
        normalized = normalized[1:]
    elif normalized.startswith("ref="):
        normalized = normalized[4:]
    return normalized if re.fullmatch(r"e\d+", normalized) else None


def get_role_snapshot_stats(snapshot: str, refs: Dict[str, RoleRef]) -> RoleSnapshotStats:
    interactive_count = sum(1 for ref in refs.values() if ref.role in INTERACTIVE_ROLES)
    return RoleSnapshotStats(
        lines=snapshot.count("\n") + 1,
        chars=len(snapshot),
        refs=len(refs),
        interactive=interactive_count,
    )


def build_role_snapshot_from_aria_snapshot(
    aria_snapshot: str,
    options: Optional[RoleSnapshotOptions] = None,
) -> Tuple[str, Dict[str, RoleRef]]:
    """
    Build a role snapshot from Playwright Locator.aria_snapshot() output.

    Mirrors OpenClaw behavior:
    - `interactive`: include interactive roles only
    - `max_depth`: remove lines deeper than depth
    - `compact`: remove unnamed structural lines and empty branches
    """
    opts = options or RoleSnapshotOptions()
    lines = str(aria_snapshot or "").split("\n")
    refs: Dict[str, RoleRef] = {}

    if opts.interactive:
        return _build_interactive_only(lines, refs, opts)

    tracker = _RoleNameTracker()
    out: List[str] = []
    counter = 0

    def next_ref() -> str:
        nonlocal counter
        counter += 1
        return f"e{counter}"

    for line in lines:
        processed = _process_line(line, refs, opts, tracker, next_ref)
        if processed is not None:
            out.append(processed)

    _remove_nth_from_non_duplicates(refs, tracker)
    tree = "\n".join(out) or "(empty)"
    if opts.compact:
        tree = _compact_tree(tree)
    return tree, refs


class _RoleNameTracker:
    def __init__(self) -> None:
        self._counts: Dict[str, int] = {}
        self._refs_by_key: Dict[str, List[str]] = {}

    def key(self, role: str, name: Optional[str]) -> str:
        return f"{role}:{name or ''}"

    def next_index(self, role: str, name: Optional[str]) -> int:
        key = self.key(role, name)
        current = self._counts.get(key, 0)
        self._counts[key] = current + 1
        return current

    def track(self, role: str, name: Optional[str], ref: str) -> None:
        key = self.key(role, name)
        refs = self._refs_by_key.get(key, [])
        refs.append(ref)
        self._refs_by_key[key] = refs

    def duplicate_keys(self) -> Set[str]:
        return {key for key, refs in self._refs_by_key.items() if len(refs) > 1}


def _get_indent_level(line: str) -> int:
    leading = len(line) - len(line.lstrip(" "))
    return leading // 2


def _process_line(
    line: str,
    refs: Dict[str, RoleRef],
    options: RoleSnapshotOptions,
    tracker: _RoleNameTracker,
    next_ref,
) -> Optional[str]:
    depth = _get_indent_level(line)
    if options.max_depth is not None and depth > options.max_depth:
        return None

    match = re.match(r'^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$', line)
    if not match:
        return None if options.interactive else line

    prefix, role_raw, name, suffix = match.groups()
    if role_raw.startswith("/"):
        return None if options.interactive else line

    role = role_raw.lower()
    is_interactive = role in INTERACTIVE_ROLES
    is_content = role in CONTENT_ROLES
    is_structural = role in STRUCTURAL_ROLES

    if options.interactive and not is_interactive:
        return None
    if options.compact and is_structural and not name:
        return None

    should_have_ref = is_interactive or (is_content and bool(name))
    if not should_have_ref:
        return line

    ref = next_ref()
    nth = tracker.next_index(role, name)
    tracker.track(role, name, ref)
    refs[ref] = RoleRef(role=role, name=name, nth=nth)

    enhanced = f"{prefix}{role_raw}"
    if name:
        enhanced += f' "{name}"'
    enhanced += f" [ref={ref}]"
    if nth > 0:
        enhanced += f" [nth={nth}]"
    if suffix:
        enhanced += suffix
    return enhanced


def _build_interactive_only(
    lines: List[str],
    refs: Dict[str, RoleRef],
    options: RoleSnapshotOptions,
) -> Tuple[str, Dict[str, RoleRef]]:
    result: List[str] = []
    tracker = _RoleNameTracker()
    counter = 0

    for line in lines:
        depth = _get_indent_level(line)
        if options.max_depth is not None and depth > options.max_depth:
            continue

        match = re.match(r'^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$', line)
        if not match:
            continue

        _, role_raw, name, suffix = match.groups()
        if role_raw.startswith("/"):
            continue

        role = role_raw.lower()
        if role not in INTERACTIVE_ROLES:
            continue

        counter += 1
        ref = f"e{counter}"
        nth = tracker.next_index(role, name)
        tracker.track(role, name, ref)
        refs[ref] = RoleRef(role=role, name=name, nth=nth)

        enhanced = f"- {role_raw}"
        if name:
            enhanced += f' "{name}"'
        enhanced += f" [ref={ref}]"
        if nth > 0:
            enhanced += f" [nth={nth}]"
        if "[" in suffix:
            enhanced += suffix
        result.append(enhanced)

    _remove_nth_from_non_duplicates(refs, tracker)
    return ("\n".join(result) or "(no interactive elements)"), refs


def _remove_nth_from_non_duplicates(refs: Dict[str, RoleRef], tracker: _RoleNameTracker) -> None:
    duplicates = tracker.duplicate_keys()
    for key, data in refs.items():
        ref_key = tracker.key(data.role, data.name)
        if ref_key not in duplicates and refs[key].nth is not None:
            refs[key].nth = None


def _compact_tree(tree: str) -> str:
    lines = tree.split("\n")
    result: List[str] = []

    for i, line in enumerate(lines):
        if "[ref=" in line:
            result.append(line)
            continue

        # Keep content lines that include name text.
        if ":" in line and not line.rstrip().endswith(":"):
            result.append(line)
            continue

        current_indent = _get_indent_level(line)
        has_relevant_children = False
        for j in range(i + 1, len(lines)):
            child_indent = _get_indent_level(lines[j])
            if child_indent <= current_indent:
                break
            if "[ref=" in lines[j]:
                has_relevant_children = True
                break

        if has_relevant_children:
            result.append(line)

    return "\n".join(result)
