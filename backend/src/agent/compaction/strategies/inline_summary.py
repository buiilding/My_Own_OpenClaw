"""Provider-agnostic inline summary compaction strategy."""

from __future__ import annotations

import logging
from typing import List

from backend.src.agent.compaction.models import CompactionInput, StrategyOutput
from backend.src.agent.compaction.prompt import (
    build_compaction_prompt_messages,
    render_messages_for_compaction_prompt,
)
from backend.src.agent.compaction.strategies.base import CompactionStrategy
from backend.src.core.messages.structures import StoredMessage
from backend.src.llm.client import LLMClient

logger = logging.getLogger(__name__)


class InlineSummaryCompactionStrategy(CompactionStrategy):
    """Compaction strategy that summarizes history using current configured LLM."""

    strategy_name = "inline"

    async def compact(
        self,
        *,
        llm_client: LLMClient,
        model: str,
        compaction_input: CompactionInput,
    ) -> StrategyOutput:
        rendered_history = render_messages_for_compaction_prompt(
            compaction_input.messages_to_compact
        )
        prompt_messages = build_compaction_prompt_messages(
            rendered_history=rendered_history,
            custom_prompt=compaction_input.custom_prompt,
        )
        summary_text = await llm_client.get_completion(
            model=model,
            messages=prompt_messages,
            max_output_tokens=compaction_input.summary_max_tokens,
        )
        normalized = self._normalize_summary_text(
            summary_text,
            fallback_messages=compaction_input.messages_to_compact,
        )
        return StrategyOutput(
            summary_text=normalized,
            strategy_name=self.strategy_name,
        )

    def _normalize_summary_text(
        self,
        summary_text: str,
        *,
        fallback_messages: List[StoredMessage],
    ) -> str:
        cleaned = (summary_text or "").strip()
        if cleaned:
            return cleaned
        logger.warning(
            "[Compaction] Inline strategy returned empty summary; using deterministic fallback."
        )
        return self._fallback_summary(fallback_messages)

    @staticmethod
    def _fallback_summary(messages: List[StoredMessage]) -> str:
        if not messages:
            return "No prior conversation details were available."
        rendered_tail = render_messages_for_compaction_prompt(
            messages[-8:],
            max_chars=2400,
        ).strip()
        if not rendered_tail:
            return "Conversation compressed due to token budget. Recent context was unavailable."
        return (
            "Objective:\n"
            "Recent history was compacted after the model returned an empty summary.\n"
            "Confirmed state/results:\n"
            f"{rendered_tail}\n"
            "Open tasks / immediate next step:\n"
            "Resume from the most recent retained context above and verify unconfirmed details before acting."
        )
