from typing import Protocol, List, Dict, Any, Optional, runtime_checkable

@runtime_checkable
class MemoryStoreInterface(Protocol):
    """Interface for low-level memory storage."""
    
    def add(self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Add a memory item."""
        ...

    def search(self, query: str, user_id: str, limit: int = 5, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Search memories."""
        ...

    def delete(self, memory_id: str, user_id: str) -> bool:
        """Delete a memory item."""
        ...

@runtime_checkable
class MemoryManagerInterface(Protocol):
    """Interface for high-level memory management."""
    
    def store_episodic_memory(self, user_message: str, assistant_reply: str) -> None:
        """Store a conversation turn."""
        ...

    async def summarize_and_store_semantic_memory(self) -> int:
        """Summarize recent memories into semantic memory."""
        ...

    def retrieve_memories(self, query: str, limit: int = 5) -> Dict[str, List[str]]:
        """Retrieve relevant memories."""
        ...

    def format_context(self, memories: Dict[str, List[str]]) -> str:
        """Format memories for the LLM context."""
        ...

