"""Conversation-history compaction engine."""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import TYPE_CHECKING, Any, List, Optional

from backend.src.agent.compaction.models import (
    CompactionDecision,
    CompactionInput,
    CompactionReplacementMessagePreview,
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
DEFAULT_TRIGGER_FALLBACK_TOKENS = 120000
AUTO_TRIGGER_RATIO = 0.90
OVERSIZED_TAIL_MARKER = "\n\n[[TRUNCATED DURING CONTEXT COMPACTION]]\n\n"


class CompactionEngine:
    """Applies token-threshold history compaction for one session."""

    def __init__(self, session: "AgentSession") -> None:
        self._session = session
        self._inline_strategy = InlineSummaryCompactionStrategy()
        self._last_provider_prompt_tokens: Optional[int] = None

    def record_provider_prompt_tokens(self, prompt_tokens: Optional[int]) -> None:
        """Remember provider-reported prompt usage for the next auto decision."""
        if not isinstance(prompt_tokens, int) or prompt_tokens <= 0:
            return
        if (
            self._last_provider_prompt_tokens is None
            or prompt_tokens > self._last_provider_prompt_tokens
        ):
            self._last_provider_prompt_tokens = prompt_tokens

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
        local_before_tokens = self._get_prompt_token_count(model=model)
        before_tokens = self._resolve_decision_token_count(local_before_tokens)
        projected_tokens = before_tokens + self._estimate_pending_user_tokens(
            model=model,
            pending_user_content=pending_user_content,
        )
        trigger_tokens = self._resolve_trigger_tokens(model=model)
        strategy_name = self._resolve_strategy_name()
        user_turn_index = self._current_user_turn_index()
        decision_source = self._decision_token_source(
            local_before_tokens, before_tokens
        )

        if not self._is_enabled(manual=(reason == "manual")):
            decision = CompactionDecision(
                should_compact=False,
                reason=reason,
                strategy_name=strategy_name,
                before_tokens=before_tokens,
                projected_tokens=projected_tokens,
                user_turn_index=user_turn_index,
                skip_reason="disabled",
            )
            self._log_decision(
                decision,
                trigger_tokens=trigger_tokens,
                local_before_tokens=local_before_tokens,
                decision_source=decision_source,
                force=force,
            )
            return decision

        if not force and projected_tokens < trigger_tokens:
            decision = CompactionDecision(
                should_compact=False,
                reason=reason,
                strategy_name=strategy_name,
                before_tokens=before_tokens,
                projected_tokens=projected_tokens,
                user_turn_index=user_turn_index,
                skip_reason="below-threshold",
            )
            self._log_decision(
                decision,
                trigger_tokens=trigger_tokens,
                local_before_tokens=local_before_tokens,
                decision_source=decision_source,
                force=force,
            )
            return decision

        decision = CompactionDecision(
            should_compact=True,
            reason=reason,
            strategy_name=strategy_name,
            before_tokens=before_tokens,
            projected_tokens=projected_tokens,
            user_turn_index=user_turn_index,
            skip_reason=None,
        )
        self._log_decision(
            decision,
            trigger_tokens=trigger_tokens,
            local_before_tokens=local_before_tokens,
            decision_source=decision_source,
            force=force,
        )
        return decision

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
                replacement_history_preview=[],
                replacement_history_entries=[],
                skip_reason=active_decision.skip_reason,
            )

        current_messages = self._session.history.get_stored_messages()
        compaction_input = self._build_compaction_input(
            current_messages,
            allow_minimal_history=(reason in {"manual", "overflow-retry"}),
        )
        if compaction_input is None:
            return CompactionResult(
                applied=False,
                reason=reason,
                strategy_name=active_decision.strategy_name,
                before_tokens=active_decision.before_tokens,
                after_tokens=active_decision.before_tokens,
                removed_messages=0,
                summary_text="",
                replacement_history_preview=[],
                replacement_history_entries=[],
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
        replacement_history_preview = self._build_replacement_history_preview(
            replacement_messages
        )
        replacement_history_entries = self._build_replacement_history_entries(
            replacement_messages
        )
        current_after_summary = self._session.history.get_stored_messages()
        if current_after_summary != current_messages:
            if current_after_summary[: len(current_messages)] == current_messages:
                concurrent_suffix = current_after_summary[len(current_messages) :]
                replacement_messages = [*replacement_messages, *concurrent_suffix]
                replacement_history_preview = self._build_replacement_history_preview(
                    replacement_messages
                )
                replacement_history_entries = self._build_replacement_history_entries(
                    replacement_messages
                )
                logger.warning(
                    "[Compaction] Preserved %s messages appended while compaction was in flight",
                    len(concurrent_suffix),
                )
            else:
                logger.warning(
                    "[Compaction] Skipped stale compaction replacement because history changed during summary generation"
                )
                return CompactionResult(
                    applied=False,
                    reason=reason,
                    strategy_name=strategy_output.strategy_name,
                    before_tokens=active_decision.before_tokens,
                    after_tokens=self._get_prompt_token_count(
                        model=self._session.cfg.llm_model
                    ),
                    removed_messages=0,
                    summary_text=strategy_output.summary_text,
                    replacement_history_preview=[],
                    replacement_history_entries=[],
                    skip_reason="history-changed",
                )

        self._session.history.replace_with_stored_messages(replacement_messages)

        after_tokens = self._get_prompt_token_count(model=self._session.cfg.llm_model)
        removed_messages = max(0, len(current_messages) - len(replacement_messages))
        self._last_provider_prompt_tokens = None

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
            replacement_history_preview=replacement_history_preview,
            replacement_history_entries=replacement_history_entries,
            skip_reason=None,
        )

    def _get_prompt_token_count(self, *, model: str) -> int:
        prompt_builder = getattr(self._session, "prompt_builder", None)
        if prompt_builder is None or not hasattr(
            prompt_builder, "get_prompt_token_count"
        ):
            return self._session.history.get_token_count(model)
        return prompt_builder.get_prompt_token_count(
            self._session.history,
            model_id=model,
        )

    @staticmethod
    def _build_replacement_history_preview(
        replacement_messages: List[StoredMessage],
    ) -> List[CompactionReplacementMessagePreview]:
        return [
            CompactionReplacementMessagePreview(
                role=message.role.value,
                message_type=message.message_type.value,
                content=message.content,
                tool_name=message.tool_name,
                tool_call_id=message.tool_call_id,
            )
            for message in replacement_messages
        ]

    @staticmethod
    def _build_replacement_history_entries(
        replacement_messages: List[StoredMessage],
    ) -> List[dict]:
        entries: List[dict] = []
        for message in replacement_messages:
            entry = {
                "role": message.role.value,
                "content": message.content,
                "message_type": message.message_type.value,
                "tool_name": message.tool_name,
                "tool_call_id": message.tool_call_id,
                "tool_calls": message.tool_calls,
                "image_data": message.image_data,
                "compaction_facts": message.compaction_facts,
            }
            if message.structured_content is not None:
                entry["structured_content"] = message.structured_content
            entries.append(entry)
        return entries

    def _build_compaction_input(
        self,
        messages: List[StoredMessage],
        *,
        allow_minimal_history: bool = False,
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
            if not allow_minimal_history:
                return None
            split_index = len(messages)

        messages_to_compact = messages[:split_index]
        keep_tail_messages = messages[split_index:]
        messages_to_compact, keep_tail_messages = self._fit_tail_to_target_budget(
            messages_to_compact=messages_to_compact,
            keep_tail_messages=keep_tail_messages,
        )
        if not messages_to_compact:
            return None
        return CompactionInput(
            messages_to_compact=messages_to_compact,
            keep_tail_messages=keep_tail_messages,
            summary_max_tokens=cfg.history_compaction_summary_max_tokens,
            custom_prompt=cfg.history_compaction_prompt,
        )

    def _fit_tail_to_target_budget(
        self,
        *,
        messages_to_compact: List[StoredMessage],
        keep_tail_messages: List[StoredMessage],
    ) -> tuple[List[StoredMessage], List[StoredMessage]]:
        cfg = self._session.cfg
        target_tokens = cfg.history_compaction_target_tokens
        if not isinstance(target_tokens, int) or target_tokens <= 0:
            return messages_to_compact, keep_tail_messages

        tail_budget = max(1, target_tokens - cfg.history_compaction_summary_max_tokens)
        compacted_messages = list(messages_to_compact)
        tail_messages = list(keep_tail_messages)

        while (
            len(tail_messages) > 1
            and self._count_messages_tokens(tail_messages) > tail_budget
        ):
            drop_count = self._count_leading_tail_turn_messages(tail_messages)
            compacted_messages.extend(tail_messages[:drop_count])
            tail_messages = tail_messages[drop_count:]

        if tail_messages and self._count_messages_tokens(tail_messages) > tail_budget:
            tail_messages = [
                self._truncate_tail_message_for_budget(tail_messages[0], tail_budget)
            ]

        return compacted_messages, tail_messages

    @staticmethod
    def _count_leading_tail_turn_messages(messages: List[StoredMessage]) -> int:
        if not messages:
            return 0
        if messages[0].role != MessageRole.USER:
            for index, message in enumerate(messages[1:], start=1):
                if message.role == MessageRole.USER:
                    return index
            return len(messages)
        for index, message in enumerate(messages[1:], start=1):
            if message.role == MessageRole.USER:
                return index
        return len(messages)

    def _count_messages_tokens(self, messages: List[StoredMessage]) -> int:
        if not messages:
            return 0
        token_service = get_token_service()
        return token_service.count_tokens(
            [message.to_llm_message() for message in messages],
            self._session.cfg.llm_model,
        )

    def _truncate_tail_message_for_budget(
        self,
        message: StoredMessage,
        token_budget: int,
    ) -> StoredMessage:
        token_service = get_token_service()
        truncator = getattr(token_service, "truncate_text", None)
        if callable(truncator):
            truncated, _original_tokens, did_truncate, _source = truncator(
                message.content,
                model=self._session.cfg.llm_model,
                token_limit=max(1, token_budget),
                marker=OVERSIZED_TAIL_MARKER,
            )
        else:
            char_limit = max(1, token_budget * 4)
            did_truncate = len(message.content) > char_limit
            truncated = (
                message.content[:char_limit] if did_truncate else message.content
            )

        if not did_truncate:
            return message

        compaction_facts: dict[str, Any] = dict(message.compaction_facts or {})
        compaction_facts["context_compaction_truncated"] = True
        return replace(
            message,
            content=truncated,
            structured_content=None,
            image_data=None,
            compaction_facts=compaction_facts,
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

    def _resolve_trigger_tokens(self, *, model: str) -> int:
        configured_trigger = self._session.cfg.history_compaction_trigger_tokens
        if isinstance(configured_trigger, int) and configured_trigger > 0:
            return configured_trigger

        token_service = get_token_service()
        max_input_tokens = None
        if hasattr(token_service, "get_model_max_input_tokens"):
            try:
                max_input_tokens = token_service.get_model_max_input_tokens(model)
            except Exception:
                logger.debug(
                    "[Compaction] Failed to resolve model max input tokens (model=%s)",
                    model,
                    exc_info=True,
                )

        if isinstance(max_input_tokens, int) and max_input_tokens > 0:
            return max(2048, int(max_input_tokens * AUTO_TRIGGER_RATIO))
        return DEFAULT_TRIGGER_FALLBACK_TOKENS

    def _resolve_decision_token_count(self, local_before_tokens: int) -> int:
        provider_prompt_tokens = self._last_provider_prompt_tokens
        if isinstance(provider_prompt_tokens, int) and provider_prompt_tokens > 0:
            return max(local_before_tokens, provider_prompt_tokens)
        return local_before_tokens

    def _decision_token_source(
        self,
        local_before_tokens: int,
        before_tokens: int,
    ) -> str:
        if (
            isinstance(self._last_provider_prompt_tokens, int)
            and self._last_provider_prompt_tokens > local_before_tokens
            and before_tokens == self._last_provider_prompt_tokens
        ):
            return "provider-high-water"
        return "local-estimate"

    @staticmethod
    def _log_decision(
        decision: CompactionDecision,
        *,
        trigger_tokens: int,
        local_before_tokens: int,
        decision_source: str,
        force: bool,
    ) -> None:
        logger.info(
            "[Compaction] Decision reason=%s should_compact=%s skip_reason=%s "
            "strategy=%s before=%s projected=%s trigger=%s local_before=%s "
            "source=%s user_turn_index=%s force=%s",
            decision.reason,
            decision.should_compact,
            decision.skip_reason,
            decision.strategy_name,
            decision.before_tokens,
            decision.projected_tokens,
            trigger_tokens,
            local_before_tokens,
            decision_source,
            decision.user_turn_index,
            force,
        )

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
