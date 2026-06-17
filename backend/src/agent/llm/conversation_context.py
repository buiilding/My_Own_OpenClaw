"""
Conversation Context.

Manages prompt preparation and caching for the agent interaction loop.
Handles first-iteration prompt building with metadata, and subsequent-iteration
cached history retrieval.
"""

import logging
import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from backend.src.core.types.schemas import LLMMessage
from backend.src.llm.prompts.prompt_metadata import PromptMetadata

if TYPE_CHECKING:
    from backend.src.agent.session.state import ConversationHistory
    from backend.src.llm.prompts.prompt_constructor import PromptConstructor

logger = logging.getLogger(__name__)


class ConversationContext:
    """
    Manages conversation context and prompt preparation.

    Responsibility: Provider prompt building and stable tool-schema caching only.
    Does NOT emit events or make business decisions.
    """

    def __init__(
        self,
        prompt_constructor: "PromptConstructor",
        history: "ConversationHistory",
    ):
        """
        Initialize the prompt coordinator.

        Args:
            prompt_constructor: Constructor for building prompts
            history: Conversation history manager
        """
        self.prompt_builder = prompt_constructor
        self.history = history
        self._cached_tool_schemas: Optional[List[Dict[str, Any]]] = None
        self._cached_metadata: Optional[PromptMetadata] = None

    def get_prompt(
        self, iteration: int
    ) -> Tuple[
        List[LLMMessage], Optional[List[Dict[str, Any]]], Optional[PromptMetadata]
    ]:
        """
        Returns prompt, tool schemas, and metadata.

        On first iteration: builds full provider prompt with metadata and caches
        the stable tool schema surface.
        On subsequent iterations: rebuilds provider messages through the same
        prompt constructor path and reuses the cached tool schemas.

        Args:
            iteration: Current loop iteration (1-indexed)

        Returns:
            Tuple of (prompt messages, tool schemas, prompt metadata)
        """
        if iteration == 1:
            # First iteration: build full provider prompt with metadata.
            prompt_build_start = time.perf_counter()
            provider_prompt = self.prompt_builder.build_provider_prompt(
                stored_messages=self.history,
                include_tools=True,
            )
            prompt_build_time = time.perf_counter() - prompt_build_start
            logger.info(
                f"[Timing] Prompt building took {prompt_build_time:.3f}s (iteration={iteration})"
            )
            # Cache tool schemas and metadata for subsequent iterations.
            self._cached_tool_schemas = provider_prompt.tool_schemas
            self._cached_metadata = provider_prompt.metadata
            return (
                provider_prompt.messages,
                provider_prompt.tool_schemas,
                provider_prompt.metadata,
            )
        else:
            # Subsequent iterations must keep static prompt layers, including the
            # effective system prompt and repo/client instructions, in the request.
            history_start = time.perf_counter()
            prompt = self.prompt_builder.build_prompt_messages(self.history)
            history_time = time.perf_counter() - history_start
            if history_time > 0.001:  # Only log if significant
                logger.info(
                    f"[Timing] Prompt message rebuilding took {history_time:.3f}s (iteration={iteration})"
                )
            return prompt, self._cached_tool_schemas, self._cached_metadata
