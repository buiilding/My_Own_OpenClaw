"""
Memory Manager - High-level interface for memory operations.

Manages episodic and semantic memory storage, retrieval, and summarization
using the local memory store implementation.
"""
import asyncio
import logging
from typing import Dict, List, Optional

from backend.src.core.config import AppConfig
from backend.src.core.interfaces.memory_store import MemoryStoreInterface
from backend.src.memory.retrieval import MemorySummarizer, SemanticRetrieval
from backend.src.memory.schemas import EpisodicMemory
from backend.src.llm.llm_client import LLMClient

logger = logging.getLogger(__name__)


class MemoryManager:
    """
    High-level memory manager for episodic and semantic memory operations.
    """

    def __init__(
        self, 
        user_id: str, 
        session_id: str, 
        memory_store: Optional[MemoryStoreInterface],
        retrieval: Optional[SemanticRetrieval],
        summarizer: Optional[MemorySummarizer],
        cfg: AppConfig
    ):
        """
        Initialize the memory manager with injected dependencies.

        Args:
            user_id: User identifier
            session_id: Session identifier
            memory_store: Storage backend
            retrieval: Retrieval service
            summarizer: Summarization service
            cfg: Application configuration
        """
        self.user_id = user_id
        self.session_id = session_id
        self.memory_store = memory_store
        self.retrieval = retrieval
        self.summarizer = summarizer
        self.cfg = cfg

        if not self.cfg.memory_enabled:
            logger.warning("Memory system is disabled")

    async def update_config(self, new_cfg: AppConfig, llm_client: Optional[LLMClient] = None) -> None:
        """
        Updates the memory manager's configuration.

        Args:
            new_cfg: New AppConfig instance
            llm_client: Updated LLM client (required if config changes affect LLM)
        """
        self.cfg = new_cfg
        
        if self.summarizer and llm_client:
            self.summarizer.llm_client = llm_client
            self.summarizer.cfg = new_cfg
            
        logger.info("Updated memory manager configuration")

    async def store_episodic_memory(self, user_message: str, assistant_reply: str) -> None:
        """
        Store a raw user-assistant interaction as episodic memory.

        Args:
            user_message: User's message
            assistant_reply: Assistant's reply
        """
        if not self.memory_store or not self.cfg.memory_enabled:
            return

        episodic_memory = EpisodicMemory(
            user_id=self.user_id,
            session_id=self.session_id,
            content=f"User: {user_message}\nAssistant: {assistant_reply}",
        )

        await self.memory_store.add(
            episodic_memory.content,
            user_id=self.user_id,
            metadata={
                "type": "episodic",
                "session_id": self.session_id,
                "timestamp": episodic_memory.timestamp.isoformat(),
                "summarized": "false",
            },
        )

        logger.debug(
            f"Stored episodic memory for user {self.user_id}, session {self.session_id}"
        )

    async def summarize_and_store_semantic_memory(self) -> int:
        """
        Summarize recent episodic memories and store them as semantic memory.

        Returns:
            Number of semantic memories created
        """
        if not self.summarizer or not self.cfg.memory_enabled:
            return 0

        try:
            count = await self.summarizer.summarize_episodic_memories(
                user_id=self.user_id, session_id=self.session_id
            )
            logger.info(f"Created {count} semantic memories for user {self.user_id}")
            return count
        except Exception as e:
            logger.error(f"Error during summarization: {e}", exc_info=True)
            return 0

    async def retrieve_memories(self, query: str, limit: int = 5) -> Dict[str, List[str]]:
        """
        Retrieve relevant semantic and recent episodic memories.

        Args:
            query: Search query
            limit: Maximum number of results per type

        Returns:
            Dictionary with 'semantic' and 'episodic' keys containing memory text lists
        """
        if not self.retrieval or not self.cfg.memory_enabled:
            return {"semantic": [], "episodic": []}

        # Use hybrid search to get both semantic and episodic memories
        results = await self.retrieval.hybrid_search(
            query=query, user_id=self.user_id, limit=limit
        )

        return {
            "semantic": [mem["text"] for mem in results.get("semantic", [])],
            "episodic": [mem["text"] for mem in results.get("episodic", [])],
        }

    def format_context(self, memories: Dict[str, List[str]]) -> str:
        """
        Format memories into a string for LLM context.

        Uses a format without headers to prevent the LLM from echoing memory structure.

        Args:
            memories: Dictionary with 'semantic' and 'episodic' keys

        Returns:
            Formatted context string
        """
        context = []

        # Format semantic memories as plain facts without headers
        if memories.get("semantic"):
            for fact in memories["semantic"]:
                context.append(f"• {fact}")

        # Format episodic memories as plain facts without headers
        if memories.get("episodic"):
            for interaction in memories["episodic"]:
                context.append(f"• {interaction}")

        return "\n".join(context) if context else ""
