"""
Interface for memory storage implementations.
"""
from typing import Protocol, Dict, List, Any, Optional, runtime_checkable


@runtime_checkable
class MemoryStoreInterface(Protocol):
    """
    Interface for low-level memory storage operations.
    This is separate from MemoryManagerInterface which handles high-level operations.
    """
    
    async def add(
        self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store a memory entry and return its ID.
        
        Args:
            text: The content to store
            user_id: User identifier
            metadata: Optional metadata dictionary
            
        Returns:
            Memory ID string
        """
        ...
    
    async def search(
        self,
        query: str,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Search memories using semantic similarity.
        
        Args:
            query: Search query text
            user_id: User identifier
            filters: Optional metadata filters (e.g., {"metadata.type": "episodic"})
            limit: Maximum number of results
            
        Returns:
            List of memory dictionaries with 'id', 'text', 'metadata', 'score' keys
        """
        ...
    
    async def update(self, memory_id: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Update memory metadata.
        
        Args:
            memory_id: Memory ID to update
            metadata: New metadata dictionary (merged with existing)
            
        Returns:
            True if update successful, False otherwise
        """
        ...
    
    async def delete(self, memory_id: str) -> bool:
        """
        Delete a memory entry.
        
        Args:
            memory_id: Memory ID to delete
            
        Returns:
            True if deletion successful, False otherwise
        """
        ...
    
    async def get_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics about stored memories.
        
        Args:
            user_id: Optional user ID filter
            
        Returns:
            Dictionary with statistics (total_count, by_type, etc.)
        """
        ...

