"""
Prompt Coordinator.

Manages prompt preparation and caching for the agent interaction loop.
Handles first-iteration prompt building with metadata, and subsequent-iteration
cached history retrieval.
"""
import logging
import time
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from backend.src.core.types.schemas import LLMMessage
from backend.src.llm.prompts import PromptMetadata

if TYPE_CHECKING:
    from backend.src.agent.core.state import ConversationHistory
    from backend.src.llm.prompts import PromptConstructor

logger = logging.getLogger(__name__)


class PromptCoordinator:
    """
    Coordinates prompt preparation and caching.
    
    Responsibility: Prompt building and caching only.
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
    ) -> Tuple[List[LLMMessage], Optional[List[Dict[str, Any]]], Optional[PromptMetadata]]:
        """
        Returns prompt, tool schemas, and metadata.
        
        On first iteration: builds full prompt with metadata and caches it.
        On subsequent iterations: returns cached history and metadata.
        
        Args:
            iteration: Current loop iteration (1-indexed)
            
        Returns:
            Tuple of (prompt messages, tool schemas, prompt metadata)
        """
        if iteration == 1:
            # First iteration: build full prompt with metadata
            prompt_build_start = time.perf_counter()
            prompt, tool_schemas, prompt_metadata = self.prompt_builder.build_prompt(
                stored_messages=self.history,
                include_tools=True,
            )
            prompt_build_time = time.perf_counter() - prompt_build_start
            logger.info(f"[Timing] Prompt building took {prompt_build_time:.3f}s (iteration={iteration})")
            # Cache tool schemas and metadata for subsequent iterations
            self._cached_tool_schemas = tool_schemas
            self._cached_metadata = prompt_metadata
            return prompt, tool_schemas, prompt_metadata
        else:
            # Subsequent iterations: just get history directly (O(1) with cache)
            history_start = time.perf_counter()
            prompt = self.history.get_history()
            history_time = time.perf_counter() - history_start
            if history_time > 0.001:  # Only log if significant
                logger.info(f"[Timing] History retrieval took {history_time:.3f}s (iteration={iteration})")
            return prompt, self._cached_tool_schemas, self._cached_metadata
