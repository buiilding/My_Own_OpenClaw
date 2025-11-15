"""
Memory Manager - High-level interface for memory operations.

Manages episodic and semantic memory storage, retrieval, and summarization
using the local memory store implementation.
"""
import asyncio
import logging
from typing import Dict, List, Optional

from backend.config import AppConfig, get_config_dir
from backend.memory.retrieval import MemorySummarizer, SemanticRetrieval
from backend.memory.schemas import EpisodicMemory
from backend.memory.storage import LocalMemoryStore

logger = logging.getLogger(__name__)

# Global memory store instance (singleton pattern)
_memory_store: Optional[LocalMemoryStore] = None
_memory_store_config: Optional[AppConfig] = None


def get_memory_store(cfg: Optional[AppConfig] = None) -> LocalMemoryStore:
    """
    Get or create the global memory store instance.

    Args:
        cfg: Optional AppConfig instance (uses get_settings() if not provided)

    Returns:
        LocalMemoryStore instance
    """
    global _memory_store, _memory_store_config

    if cfg is None:
        from backend.config import get_settings

        cfg = get_settings()

    # Recreate store if config changed
    if _memory_store is None or _memory_store_config != cfg:
        if not cfg.memory_enabled:
            raise ValueError("Memory system is disabled in configuration")

        db_path = cfg.memory_db_path
        if db_path is None:
            config_dir = get_config_dir()
            memory_dir = config_dir / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(memory_dir / "memories.db")

        _memory_store = LocalMemoryStore(
            db_path=db_path, embedding_model=cfg.embedding_model
        )
        _memory_store_config = cfg
        logger.info(f"Initialized memory store at {db_path}")

    return _memory_store


class MemoryManager:
    """
    High-level memory manager for episodic and semantic memory operations.
    """

    def __init__(self, user_id: str, session_id: str, cfg: Optional[AppConfig] = None):
        """
        Initialize the memory manager.

        Args:
            user_id: User identifier
            session_id: Session identifier
            cfg: Optional AppConfig instance
        """
        self.user_id = user_id
        self.session_id = session_id

        if cfg is None:
            from backend.config import get_settings

            cfg = get_settings()

        self.cfg = cfg

        # Get memory store
        if cfg.memory_enabled:
            self.memory_store = get_memory_store(cfg)
            self.retrieval = SemanticRetrieval(self.memory_store)
            # Lazy import to avoid circular dependency with agent.agent_session
            from backend.agent.llm.llm_client import get_llm_client

            self.llm_client = get_llm_client(cfg)
            self.summarizer = MemorySummarizer(
                memory_store=self.memory_store, llm_client=self.llm_client, cfg=cfg
            )
        else:
            self.memory_store = None
            self.retrieval = None
            self.llm_client = None
            self.summarizer = None
            logger.warning("Memory system is disabled")

    async def update_config(self, new_cfg: AppConfig) -> None:
        """
        Updates the memory manager's configuration and re-initializes dependencies.

        Args:
            new_cfg: New AppConfig instance
        """
        self.cfg = new_cfg

        # Re-initialize LLM client and summarizer if memory is enabled
        if new_cfg.memory_enabled and self.memory_store:
            # Lazy import to avoid circular dependency with agent.agent_session
            from backend.agent.llm.llm_client import get_llm_client

            self.llm_client = get_llm_client(new_cfg)
            self.summarizer = MemorySummarizer(
                memory_store=self.memory_store, llm_client=self.llm_client, cfg=new_cfg
            )
            logger.info("Updated memory manager configuration")

    def store_episodic_memory(self, user_message: str, assistant_reply: str) -> None:
        """
        Store a raw user-assistant interaction as episodic memory.

        Args:
            user_message: User's message
            assistant_reply: Assistant's reply
        """
        if not self.memory_store:
            return

        episodic_memory = EpisodicMemory(
            user_id=self.user_id,
            session_id=self.session_id,
            content=f"User: {user_message}\nAssistant: {assistant_reply}",
        )

        self.memory_store.add(
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
        if not self.summarizer:
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

    def retrieve_memories(self, query: str, limit: int = 5) -> Dict[str, List[str]]:
        """
        Retrieve relevant semantic and recent episodic memories.

        Args:
            query: Search query
            limit: Maximum number of results per type

        Returns:
            Dictionary with 'semantic' and 'episodic' keys containing memory text lists
        """
        if not self.retrieval:
            return {"semantic": [], "episodic": []}

        # Use hybrid search to get both semantic and episodic memories
        results = self.retrieval.hybrid_search(
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


# Session management for background summarization
active_sessions: Dict[str, str] = {}


async def run_summarization_periodically(cfg: Optional[AppConfig] = None) -> None:
    """
    Periodically run the summarization process for all active sessions.

    Args:
        cfg: Optional AppConfig instance
    """
    if cfg is None:
        from backend.config import get_settings

        cfg = get_settings()

    interval = cfg.summarization_interval

    while True:
        await asyncio.sleep(interval)
        logger.info("Running periodic memory summarization")

        for user_id, session_id in list(active_sessions.items()):
            try:
                manager = MemoryManager(user_id, session_id, cfg)
                await manager.summarize_and_store_semantic_memory()
            except Exception as e:
                logger.error(
                    f"Error summarizing memories for user {user_id}: {e}", exc_info=True
                )


def start_session(user_id: str, session_id: str) -> None:
    """
    Register a new session.

    Args:
        user_id: User identifier
        session_id: Session identifier
    """
    active_sessions[user_id] = session_id
    logger.debug(f"Started session {session_id} for user {user_id}")


def end_session(user_id: str, cfg: Optional[AppConfig] = None) -> None:
    """
    End a session and trigger final summarization.

    Args:
        user_id: User identifier
        cfg: Optional AppConfig instance
    """
    if user_id in active_sessions:
        session_id = active_sessions.pop(user_id)
        logger.debug(f"Ending session {session_id} for user {user_id}")

        # Trigger final summarization on session end
        if cfg is None:
            from backend.config import get_settings

            cfg = get_settings()

        if cfg.memory_enabled:
            manager = MemoryManager(user_id, session_id, cfg)
            # Run summarization in background
            asyncio.create_task(manager.summarize_and_store_semantic_memory())
