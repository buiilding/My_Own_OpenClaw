"""
Remote LLM Client

Client for calling the backend LLM API from the frontend memory system.
Used for semantic memory summarization.
"""

import aiohttp
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class RemoteLLMClient:
    """
    Client for remote LLM operations via backend API.
    
    This is used by the frontend memory system to generate semantic summaries.
    """

    def __init__(self, backend_url: str = "http://localhost:8765"):
        """
        Initialize the remote LLM client.
        
        Args:
            backend_url: Base URL of the backend API
        """
        self.backend_url = backend_url.rstrip("/")
        self._session: Optional[aiohttp.ClientSession] = None

    async def initialize(self) -> None:
        """Initialize the HTTP session."""
        if self._session is None:
            self._session = aiohttp.ClientSession()

    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session:
            await self._session.close()
            self._session = None

    async def summarize_conversations(
        self, conversations: List[str], user_id: str = "default_user"
    ) -> Dict[str, Any]:
        """
        Summarize conversations and extract semantic information.
        
        Args:
            conversations: List of conversation texts to summarize
            user_id: User identifier
            
        Returns:
            Dictionary with 'summary', 'facts', and 'success' keys
            
        Raises:
            Exception: If summarization fails
        """
        if not self._session:
            await self.initialize()
        
        url = f"{self.backend_url}/api/semantic/summarize"
        
        payload = {
            "conversations": conversations,
            "user_id": user_id
        }
        
        try:
            # Very long timeout - wait for LLM to return semantic facts (background task won't block system)
            # Using 1 hour timeout as a safety net, but effectively unlimited for normal use
            async with self._session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=3600)) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Summarization failed: {response.status} - {error_text}")
                
                result = await response.json()
                return result
                
        except aiohttp.ClientError as e:
            logger.error(f"HTTP error during summarization: {e}")
            raise Exception(f"Failed to connect to backend: {str(e)}")
        except Exception as e:
            logger.error(f"Error during summarization: {e}")
            raise
