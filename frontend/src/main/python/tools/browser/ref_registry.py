"""
Stable-ish reference registry for browser snapshots.

Goal:
- Keep the same human-facing ref IDs across repeated snapshots for the same tab/page.
- Mark newly-appeared refs with a '*' prefix (when a previous snapshot exists).
- Reset automatically when URL changes (new document/navigation).

This intentionally keeps the "refs map" in-process; callers should only send the
serialized snapshot string + small metadata to the LLM.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Set, Tuple


@dataclass
class RefRegistry:
    """
    Assigns stable ref IDs for element keys.

    Stability is as good as the provided element keys. Callers should provide
    a key that is stable across small DOM changes (id/name/aria-label/etc).
    """

    next_ref: int = 1
    key_to_ref: Dict[str, str] = field(default_factory=dict)
    ref_to_key: Dict[str, str] = field(default_factory=dict)

    last_url: str = ""
    last_snapshot_refs: Set[str] = field(default_factory=set)

    def reset(self) -> None:
        self.next_ref = 1
        self.key_to_ref.clear()
        self.ref_to_key.clear()
        self.last_snapshot_refs.clear()
        self.last_url = ""

    def assign(self, *, key: str, url: str) -> Tuple[str, bool]:
        """
        Assign (or reuse) a ref for this key.

        Returns:
            (ref, is_new_since_last_snapshot)
        """
        # Treat URL change as navigation and reset refs. This handles both explicit
        # tool navigation and click-driven navigation.
        if self.last_url and url != self.last_url:
            self.reset()

        if not self.last_url:
            self.last_url = url
        else:
            self.last_url = url

        ref = self.key_to_ref.get(key)
        if ref is None:
            ref = str(self.next_ref)
            self.next_ref += 1
            self.key_to_ref[key] = ref
            self.ref_to_key[ref] = key

        # If this is the first snapshot on this URL, don't spam * for everything.
        has_previous_snapshot = len(self.last_snapshot_refs) > 0
        is_new = has_previous_snapshot and (ref not in self.last_snapshot_refs)
        return ref, is_new

    def finalize_snapshot(self, *, seen_refs: Set[str], url: str) -> None:
        # Maintain last_url even if a snapshot had zero refs.
        self.last_url = url
        self.last_snapshot_refs = set(seen_refs)

    def has_ref(self, ref: str) -> bool:
        return ref in self.ref_to_key

