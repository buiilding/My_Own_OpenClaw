"""
Memory Summarization Pipeline - Extracts semantic facts from episodic memories.

Uses the local LLM client to extract key facts, preferences, and general
knowledge from episodic interaction logs, storing them as semantic memories.
"""
import logging
from typing import Any, Dict, List, Optional

from backend.agent.llm.llm_client import LLMClient, get_llm_client
from backend.config import AppConfig
from backend.memory.local_store import LocalMemoryStore

logger = logging.getLogger(__name__)


class MemorySummarizer:
    """
    Summarizes episodic memories into semantic facts using LLM.
    """

    def __init__(
        self,
        memory_store: LocalMemoryStore,
        llm_client: Optional[LLMClient] = None,
        cfg: Optional[AppConfig] = None,
    ):
        """
        Initialize the memory summarizer.

        Args:
            memory_store: LocalMemoryStore instance
            llm_client: LLM client for fact extraction (optional, will create if not provided)
            cfg: AppConfig instance (required if llm_client not provided)
        """
        self.memory_store = memory_store

        if llm_client:
            self.llm_client = llm_client
            self.cfg = None
        elif cfg:
            self.cfg = cfg
            self.llm_client = get_llm_client(cfg)
        else:
            raise ValueError("Either llm_client or cfg must be provided")

    async def summarize_episodic_memories(
        self, user_id: str, session_id: Optional[str] = None, batch_size: int = 10
    ) -> int:
        """
        Summarize unsummarized episodic memories into semantic facts.

        Args:
            user_id: User identifier
            session_id: Optional session ID filter
            batch_size: Number of episodic memories to process per batch

        Returns:
            Number of semantic memories created
        """
        # Get unsummarized episodic memories
        filters = {"metadata.type": "episodic", "metadata.summarized": "false"}

        if session_id:
            filters["metadata.session_id"] = session_id

        unsummarized = self.memory_store.search(
            query="",  # Empty query to get all matching
            user_id=user_id,
            filters=filters,
            limit=100,  # Process up to 100 at a time
        )

        if not unsummarized:
            logger.debug(f"No unsummarized memories found for user {user_id}")
            return 0

        logger.info(
            f"Summarizing {len(unsummarized)} episodic memories for user {user_id}"
        )

        # Process in batches
        total_created = 0
        for i in range(0, len(unsummarized), batch_size):
            batch = unsummarized[i : i + batch_size]
            created = await self._process_batch(user_id, batch, session_id)
            total_created += created

        logger.info(
            f"Created {total_created} semantic memories from {len(unsummarized)} episodic memories"
        )

        return total_created

    async def _process_batch(
        self,
        user_id: str,
        episodic_memories: List[Dict[str, Any]],
        session_id: Optional[str] = None,
    ) -> int:
        """
        Process a batch of episodic memories.

        Args:
            user_id: User identifier
            episodic_memories: List of episodic memory dictionaries
            session_id: Optional session ID

        Returns:
            Number of semantic memories created
        """
        # Prepare content for summarization
        content_parts = []
        memory_ids = []

        for memory in episodic_memories:
            content_parts.append(memory["text"])
            memory_ids.append(memory["id"])

        content_to_summarize = "\n\n---\n\n".join(content_parts)

        # Create summarization prompt
        prompt = self._create_summarization_prompt(content_to_summarize)

        # Get LLM model name
        model = self.cfg.llm_model if self.cfg else "gpt-4o"

        try:
            # Call LLM for fact extraction
            messages = [
                {
                    "role": "system",
                    "content": "You are a fact extraction assistant. Extract key facts, preferences, and general knowledge from conversation logs.",
                },
                {"role": "user", "content": prompt},
            ]

            response = await self.llm_client.get_completion(model, messages)

            # Parse response into individual facts
            facts = self._parse_facts(response)

            # Store facts as semantic memories
            created_count = 0
            for fact in facts:
                if fact.strip():
                    # Determine source session_id
                    source_session = session_id
                    if not source_session and episodic_memories:
                        # Get session_id from first memory's metadata
                        metadata = episodic_memories[0].get("metadata", {})
                        source_session = metadata.get("session_id")

                    memory_id = self.memory_store.add(
                        text=fact.strip(),
                        user_id=user_id,
                        metadata={
                            "type": "semantic",
                            "source_session_id": source_session,
                            "extracted_from": memory_ids,  # Track which episodic memories contributed
                        },
                    )
                    created_count += 1
                    logger.debug(f"Created semantic memory {memory_id}: {fact[:50]}...")

            # Mark episodic memories as summarized
            for memory_id in memory_ids:
                self.memory_store.update(memory_id, metadata={"summarized": "true"})

            return created_count

        except Exception as e:
            logger.error(f"Error during summarization: {e}", exc_info=True)
            return 0

    def _create_summarization_prompt(self, content: str) -> str:
        """
        Create the prompt for LLM fact extraction.

        Args:
            content: Episodic memory content to summarize

        Returns:
            Prompt string
        """
        return f"""Extract key facts, preferences, and general knowledge from the following conversation logs.

Focus on:
- User preferences (e.g., "User prefers AWS", "User likes Python")
- Personal facts (e.g., "User's name is John", "User works at Company X")
- General knowledge learned (e.g., "User is learning backend development")
- Important patterns or habits

Return ONLY a list of short, standalone factual statements, one per line.
Each statement should be concise and factual (avoid speculation).
Do not include timestamps or conversation context - just the facts.

Conversation logs:
{content}

Facts:"""

    def _parse_facts(self, response: str) -> List[str]:
        """
        Parse LLM response into individual facts.

        Args:
            response: LLM response text

        Returns:
            List of fact strings
        """
        facts = []

        # Split by newlines
        lines = response.strip().split("\n")

        for line in lines:
            line = line.strip()

            # Skip empty lines
            if not line:
                continue

            # Remove bullet points or numbering
            line = line.lstrip("-•*0123456789. ")

            # Skip lines that are too short or look like headers
            if len(line) < 10:
                continue

            # Skip lines that are clearly not facts (e.g., "Here are the facts:")
            skip_patterns = [
                "here are",
                "the facts",
                "key facts",
                "summary",
                "extracted",
            ]
            if any(pattern in line.lower() for pattern in skip_patterns):
                continue

            facts.append(line)

        return facts
