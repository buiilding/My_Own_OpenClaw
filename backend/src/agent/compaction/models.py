"""Compaction-domain data models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from backend.src.core.messages.structures import StoredMessage


@dataclass(frozen=True)
class CompactionDecision:
    """Preflight decision for whether compaction should run."""

    should_compact: bool
    reason: str
    strategy_name: str
    before_tokens: int
    projected_tokens: int
    user_turn_index: int
    skip_reason: Optional[str] = None


@dataclass(frozen=True)
class CompactionInput:
    """Input payload provided to compaction strategies."""

    messages_to_compact: List[StoredMessage]
    keep_tail_messages: List[StoredMessage]
    summary_max_tokens: int
    custom_prompt: Optional[str] = None


@dataclass(frozen=True)
class StrategyOutput:
    """Canonical strategy output contract."""

    summary_text: str
    strategy_name: str


@dataclass(frozen=True)
class CompactionResult:
    """Final compaction result after an attempted run."""

    applied: bool
    reason: str
    strategy_name: str
    before_tokens: int
    after_tokens: int
    removed_messages: int
    summary_text: str
    skip_reason: Optional[str] = None

