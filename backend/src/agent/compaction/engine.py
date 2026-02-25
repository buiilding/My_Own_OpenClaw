"""Conversation-history compaction engine."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, List, Optional

from backend.src.agent.compaction.models import (
    CompactionDecision,
    CompactionInput,
    CompactionResult,
)
from backend.src.agent.compaction.prompt import format_compaction_history_message
from backend.src.agent.compaction.strategies.inline_summary import (
    InlineSummaryCompactionStrategy,
)
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.services.token_service import get_token_service

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


class CompactionEngine:
    """Applies token-threshold history compaction for one session."""

    def __init__(self, session: "AgentSession") -> None:
        self._session = session
        self._inline_strategy = InlineSummaryCompactionStrategy()
        self._last_compaction_user_turn_index = -10_000

    def evaluate(
        self,
        *,
        reason: str,
        force: bool = False,
        pending_user_content: Optional[str] = None,
    ) -> CompactionDecision:
        """Evaluate whether compaction should run now."""
        cfg = self._session.cfg
        model = cfg.llm_model
        history = self._session.history
        before_tokens = history.get_token_count(model)
        projected_tokens = before_tokens + self._estimate_pending_user_tokens(
            model=model,
            pending_user_content=pending_user_content,
        )
        strategy_name = self._resolve_strategy_name()
        user_turn_index = self._current_user_turn_index()

        if not self._is_enabled(manual=(reason == "manual")):
            return CompactionDecision(
                should_compact=False,
                reason=reason,
                strategy_name=strategy_name,
                before_tokens=before_tokens,
                projected_tokens=projected_tokens,
                user_turn_index=user_turn_index,
                skip_reason="disabled",
            )

        if not force and projected_tokens < cfg.history_compaction_trigger_tokens:
            return CompactionDecision(
                should_compact=False,
                reason=reason,
                strategy_name=strategy_name,
                before_tokens=before_tokens,
                projected_tokens=projected_tokens,
                user_turn_index=user_turn_index,
                skip_reason="below-threshold",
            )

        if not force and self._is_on_cooldown(user_turn_index):
            return CompactionDecision(
                should_compact=False,
                reason=reason,
                strategy_name=strategy_name,
                before_tokens=before_tokens,
                projected_tokens=projected_tokens,
                user_turn_index=user_turn_index,
                skip_reason="cooldown",
            )

        return CompactionDecision(
            should_compact=True,
            reason=reason,
            strategy_name=strategy_name,
            before_tokens=before_tokens,
            projected_tokens=projected_tokens,
            user_turn_index=user_turn_index,
            skip_reason=None,
        )

    async def compact(
        self,
        *,
        reason: str,
        decision: Optional[CompactionDecision] = None,
    ) -> CompactionResult:
        """Run compaction (or return skipped result when decision blocks it)."""
        active_decision = decision or self.evaluate(reason=reason)
        if not active_decision.should_compact:
            return CompactionResult(
                applied=False,
                reason=reason,
                strategy_name=active_decision.strategy_name,
                before_tokens=active_decision.before_tokens,
                after_tokens=active_decision.before_tokens,
                removed_messages=0,
                summary_text="",
                skip_reason=active_decision.skip_reason,
            )

        current_messages = self._session.history.get_stored_messages()
        compaction_input = self._build_compaction_input(current_messages)
        if compaction_input is None:
            return CompactionResult(
                applied=False,
                reason=reason,
                strategy_name=active_decision.strategy_name,
                before_tokens=active_decision.before_tokens,
                after_tokens=active_decision.before_tokens,
                removed_messages=0,
                summary_text="",
                skip_reason="insufficient-history",
            )

        strategy_output = await self._inline_strategy.compact(
            llm_client=self._session.llm_client,
            model=self._session.cfg.llm_model,
            compaction_input=compaction_input,
        )
        summary_message = StoredMessage(
            role=MessageRole.ASSISTANT,
            content=format_compaction_history_message(strategy_output.summary_text),
            message_type=MessageType.CONTEXT_COMPACTION,
        )
        replacement_messages = [summary_message, *compaction_input.keep_tail_messages]
        self._session.history.replace_with_stored_messages(replacement_messages)

        after_tokens = self._session.history.get_token_count(self._session.cfg.llm_model)
        removed_messages = max(0, len(current_messages) - len(replacement_messages))
        self._last_compaction_user_turn_index = active_decision.user_turn_index

        logger.info(
            "[Compaction] Applied history compaction (reason=%s, strategy=%s, before=%s, after=%s, removed_messages=%s)",
            reason,
            strategy_output.strategy_name,
            active_decision.before_tokens,
            after_tokens,
            removed_messages,
        )
        return CompactionResult(
            applied=True,
            reason=reason,
            strategy_name=strategy_output.strategy_name,
            before_tokens=active_decision.before_tokens,
            after_tokens=after_tokens,
            removed_messages=removed_messages,
            summary_text=strategy_output.summary_text,
            skip_reason=None,
        )

    def _build_compaction_input(
        self,
        messages: List[StoredMessage],
    ) -> Optional[CompactionInput]:
        if not messages:
            return None

        cfg = self._session.cfg
        keep_recent_users = max(1, cfg.history_compaction_keep_recent_user_messages)
        split_index = self._split_index_for_recent_user_messages(
            messages,
            keep_recent_users=keep_recent_users,
        )
        if split_index <= 0:
            return None

        messages_to_compact = messages[:split_index]
        keep_tail_messages = messages[split_index:]
        if not messages_to_compact:
            return None
        return CompactionInput(
            messages_to_compact=messages_to_compact,
            keep_tail_messages=keep_tail_messages,
            summary_max_tokens=cfg.history_compaction_summary_max_tokens,
            custom_prompt=cfg.history_compaction_prompt,
        )

    @staticmethod
    def _split_index_for_recent_user_messages(
        messages: List[StoredMessage],
        *,
        keep_recent_users: int,
    ) -> int:
        user_seen = 0
        for index in range(len(messages) - 1, -1, -1):
            if messages[index].message_type == MessageType.USER_QUERY:
                user_seen += 1
                if user_seen == keep_recent_users:
                    return index
        return 0

    def _is_enabled(self, *, manual: bool) -> bool:
        cfg = self._session.cfg
        if manual:
            return bool(cfg.history_compaction_manual_enabled)
        return bool(cfg.history_compaction_enabled)

    def _resolve_strategy_name(self) -> str:
        # OpenAI remote strategy is intentionally phase-gated; fallback inline for now.
        return self._inline_strategy.strategy_name

    def _is_on_cooldown(self, user_turn_index: int) -> bool:
        cooldown_turns = max(0, self._session.cfg.history_compaction_cooldown_turns)
        return (
            user_turn_index - self._last_compaction_user_turn_index
        ) <= cooldown_turns

    def _current_user_turn_index(self) -> int:
        return sum(
            1
            for message in self._session.history.get_stored_messages()
            if message.message_type == MessageType.USER_QUERY
        )

    @staticmethod
    def _estimate_pending_user_tokens(
        *,
        model: str,
        pending_user_content: Optional[str],
    ) -> int:
        if not pending_user_content:
            return 0
        token_service = get_token_service()
        return token_service.count_message_tokens(
            {"role": "user", "content": pending_user_content},
            model,
        )

