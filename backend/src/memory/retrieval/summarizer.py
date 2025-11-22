"""
Memory Summarization Pipeline - Extracts semantic facts from episodic memories.
"""
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from backend.src.core.config import AppConfig
from backend.src.memory.storage.local_store import LocalMemoryStore

if TYPE_CHECKING:
    from backend.src.brain.llm.llm_client import LLMClient

logger = logging.getLogger(__name__)


class MemorySummarizer:
    """
    Summarizes episodic memories into semantic facts using LLM.
    """

    def __init__(
        self,
        memory_store: LocalMemoryStore,
        llm_client: Optional["LLMClient"] = None,
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

        if llm_client and cfg:
            # Both provided - use both for proper model selection
            self.llm_client = llm_client
            self.cfg = cfg
        elif llm_client:
            # Only llm_client provided - no cfg available
            self.llm_client = llm_client
            self.cfg = None
        elif cfg:
            # Only cfg provided - create llm_client from cfg
            self.cfg = cfg
            # Lazy import to avoid circular dependency with agent.agent_session
            from backend.src.brain.llm.llm_client import get_llm_client

            self.llm_client = get_llm_client(cfg)
        else:
            raise ValueError("Either llm_client or cfg must be provided")

    async def summarize_episodic_memories(
        self, user_id: str, session_id: Optional[str] = None, batch_size: int = 10
    ) -> int:
        """
        Summarize unsummarized episodic memories into semantic facts.

        Groups memories by session_id to preserve conversation context, then processes
        each complete session as a unit. If a session has more than batch_size interactions,
        it will be split into chunks of batch_size.

        Args:
            user_id: User identifier
            session_id: Optional session ID filter (if provided, only processes that session)
            batch_size: Maximum number of interactions to process per batch within a session

        Returns:
            Number of semantic memories created
        """
        # Get unsummarized episodic memories
        filters = {"metadata.type": "episodic", "metadata.summarized": "false"}

        if session_id:
            filters["metadata.session_id"] = session_id

        # Use get_by_filters instead of search for getting all matching records
        # (search uses vector similarity which doesn't work well with empty queries)
        unsummarized = self.memory_store.get_by_filters(
            user_id=user_id,
            filters=filters,
            limit=1000,  # Increased limit to ensure we get all memories for session grouping
        )

        if not unsummarized:
            logger.debug(f"No unsummarized memories found for user {user_id}")
            return 0

        logger.info(
            f"Found {len(unsummarized)} unsummarized episodic memories for user {user_id}"
        )

        # Group memories by session_id to preserve conversation context
        sessions: Dict[str, List[Dict[str, Any]]] = {}
        for memory in unsummarized:
            mem_session_id = memory.get("metadata", {}).get("session_id", "unknown")
            if mem_session_id not in sessions:
                sessions[mem_session_id] = []
            sessions[mem_session_id].append(memory)

        # Sort memories within each session by timestamp to maintain conversation order
        for session_memories in sessions.values():
            session_memories.sort(key=lambda m: m.get("timestamp", ""))

        logger.info(
            f"Grouped memories into {len(sessions)} session(s) for summarization"
        )

        # Process each session completely, splitting into chunks if needed
        total_created = 0
        for session_id_key, session_memories in sessions.items():
            logger.debug(
                f"Processing session {session_id_key} with {len(session_memories)} interactions"
            )

            # If session has more than batch_size interactions, split into chunks
            # but still process them sequentially to maintain context
            for i in range(0, len(session_memories), batch_size):
                chunk = session_memories[i : i + batch_size]
                created = await self._process_batch(
                    user_id, chunk, session_id_key or session_id
                )
                total_created += created

        logger.info(
            f"Created {total_created} semantic memories from {len(unsummarized)} episodic memories "
            f"across {len(sessions)} session(s)"
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
