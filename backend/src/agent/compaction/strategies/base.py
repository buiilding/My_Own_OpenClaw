"""Base strategy contract for history compaction."""

from __future__ import annotations

from abc import ABC, abstractmethod

from backend.src.agent.compaction.models import CompactionInput, StrategyOutput
from backend.src.llm.client import LLMClient


class CompactionStrategy(ABC):
    """Strategy interface for generating compaction summaries."""

    @property
    @abstractmethod
    def strategy_name(self) -> str:
        """Human-readable strategy identifier."""

    @abstractmethod
    async def compact(
        self,
        *,
        llm_client: LLMClient,
        model: str,
        compaction_input: CompactionInput,
    ) -> StrategyOutput:
        """Produce summary output for the provided compaction input."""

