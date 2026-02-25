"""Prompt and rendering helpers for conversation history compaction."""

from __future__ import annotations

from typing import List, Optional

from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole
from backend.src.core.types.schemas import LLMMessage

CONTEXT_COMPACTION_PREFIX = "[[CONTEXT COMPACTION SUMMARY]]"
DEFAULT_COMPACTION_SYSTEM_PROMPT = (
    "You summarize long assistant conversations for context-window compaction. "
    "Preserve user goals, constraints, decisions, errors, and unresolved next steps. "
    "Be concise and factual. Do not invent details."
)

DEFAULT_COMPACTION_INSTRUCTION = (
    "Summarize the prior conversation so future turns can continue accurately.\n"
    "Include:\n"
    "- Current user objective(s)\n"
    "- Key constraints/preferences\n"
    "- Important tool outcomes/errors\n"
    "- Open tasks and recommended next step\n"
    "Return plain text only."
)


def render_messages_for_compaction_prompt(
    messages: List[StoredMessage],
    *,
    max_chars: int = 24_000,
) -> str:
    """Render stored messages into a compact, bounded plain-text transcript block."""
    if not messages:
        return "(no prior messages)"

    chunks: list[str] = []
    consumed = 0
    for message in messages:
        role = _display_role(message.role)
        content = (message.content or "").strip()
        if not content:
            continue
        if len(content) > 1600:
            content = f"{content[:1597]}..."

        line = f"{role}: {content}\n"
        line_len = len(line)
        if consumed + line_len > max_chars:
            remaining = max_chars - consumed
            if remaining <= 32:
                break
            line = f"{line[: max(0, remaining - 3)]}...\n"
            chunks.append(line)
            break
        chunks.append(line)
        consumed += line_len

    if not chunks:
        return "(no prior messages)"
    return "".join(chunks)


def build_compaction_prompt_messages(
    *,
    rendered_history: str,
    custom_prompt: Optional[str] = None,
) -> List[LLMMessage]:
    """Build model-ready prompt messages used by inline compaction strategy."""
    instruction = (custom_prompt or DEFAULT_COMPACTION_INSTRUCTION).strip()
    user_prompt = (
        f"{instruction}\n\n"
        "Conversation to summarize:\n"
        f"{rendered_history}"
    )
    return [
        {"role": "system", "content": DEFAULT_COMPACTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]


def format_compaction_history_message(summary_text: str) -> str:
    """Wrap summary text in a stable marker for transcript readability."""
    clean = (summary_text or "").strip()
    if not clean:
        clean = "Summary unavailable."
    return f"{CONTEXT_COMPACTION_PREFIX}\n{clean}"


def _display_role(role: MessageRole) -> str:
    if role == MessageRole.USER:
        return "User"
    if role == MessageRole.ASSISTANT:
        return "Assistant"
    if role == MessageRole.TOOL:
        return "Tool"
    return "Message"

