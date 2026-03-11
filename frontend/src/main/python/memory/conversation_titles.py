"""
Conversation title helpers for transcript windows.
"""

from __future__ import annotations

import re
from typing import Optional

_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
_LEADING_PROMPT_RE = re.compile(
    r"^(please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|help\s+me\s+|"
    r"i\s+need\s+to\s+|i\s+need\s+|i\s+want\s+to\s+|show\s+me\s+|tell\s+me\s+|"
    r"how\s+to\s+|how\s+do\s+i\s+)",
    re.IGNORECASE,
)
_GENERIC_SMALLTALK = frozenset({
    "hi",
    "hello",
    "hey",
    "yo",
    "thanks",
    "thank you",
    "ok",
    "okay",
    "cool",
    "nice",
    "test",
    "testing",
})
_FALLBACK_TITLE = "New chat"
_MAX_WORDS = 8
_MAX_CHARS = 72


def derive_conversation_title(
    user_text: Optional[str],
    assistant_text: Optional[str] = None,
) -> Optional[str]:
    """
    Build a concise conversation title from early transcript content.
    """
    user_candidate = _sanitize_candidate(user_text)
    assistant_candidate = _sanitize_candidate(assistant_text)

    for candidate in (user_candidate, assistant_candidate):
        if not candidate:
            continue
        if _is_generic_smalltalk(candidate):
            continue
        return _truncate_candidate(candidate)

    if user_candidate:
        return _truncate_candidate(user_candidate)
    if assistant_candidate:
        return _truncate_candidate(assistant_candidate)
    return _FALLBACK_TITLE


def derive_pending_conversation_title(user_text: Optional[str]) -> Optional[str]:
    """
    Build a temporary title directly from the first user message.
    """
    candidate = _sanitize_candidate(user_text, strip_leading_prompt=False)
    if not candidate:
        return _FALLBACK_TITLE
    return _truncate_candidate(candidate)


def _sanitize_candidate(text: Optional[str], *, strip_leading_prompt: bool = True) -> str:
    if not isinstance(text, str):
        return ""
    stripped = text.strip()
    if not stripped:
        return ""

    # Keep only the first paragraph/sentence-like segment.
    first_line = stripped.splitlines()[0].strip()
    if not first_line:
        return ""

    first_line = _URL_RE.sub("", first_line)
    first_line = first_line.replace("`", "")
    first_line = re.sub(r"\s+", " ", first_line).strip()
    first_line = first_line.strip(" .,!?:;\"'()[]{}")
    if strip_leading_prompt:
        first_line = _LEADING_PROMPT_RE.sub("", first_line).strip()
    return first_line


def _is_generic_smalltalk(candidate: str) -> bool:
    lowered = candidate.lower().strip()
    if not lowered:
        return True
    if lowered in _GENERIC_SMALLTALK:
        return True

    # "hi there", "hello assistant", etc.
    tokens = lowered.split()
    if len(tokens) <= 2 and all(token in _GENERIC_SMALLTALK for token in tokens):
        return True
    return False


def _truncate_candidate(candidate: str) -> str:
    words = candidate.split()
    if not words:
        return _FALLBACK_TITLE

    trimmed = " ".join(words[:_MAX_WORDS]).strip()
    if len(trimmed) > _MAX_CHARS:
        trimmed = trimmed[:_MAX_CHARS].rstrip()

    return trimmed or _FALLBACK_TITLE
