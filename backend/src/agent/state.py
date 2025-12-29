"""
Conversation History Manager for maintaining conversation state.

This module manages the conversation history, including pruning to prevent
context window overflow.
"""

import logging
from typing import List, Optional

from backend.src.core.messages import MessageRole, MessageType, StoredMessage
from backend.src.core.types import LLMMessage

logger = logging.getLogger(__name__)


class ConversationHistory:
    """
    Manages conversation history with automatic pruning.
    
    History stores messages in structured StoredMessage format for type safety.
    When retrieving history, converts to LLMMessage format for LLM consumption.
    """

    def __init__(self, max_length: int = 10):
        """
        Initialize the conversation history.

        Args:
            max_length: Maximum number of messages to keep in history
        """
        # Internal format: List of StoredMessage instances
        self.history: List[StoredMessage] = []
        self.max_length = max_length
        self._last_user_query: Optional[StoredMessage] = None  # Cached last user query

    def add_user_message(self, message: str, image_data: Optional[str] = None) -> None:
        """
        Add an actual user message to the conversation history.
        These messages trigger memory retrieval.

        Args:
            message: Message text content (already includes memory sections from executor)
            image_data: Optional base64 image data
        
        Note: Active window is included in system_context XML injected by prompt_constructor,
        so we don't add it here to avoid duplication.
        """
        stored_msg = StoredMessage(
            role=MessageRole.USER,
            content=message,  # Message already has <user_query> and memory sections
            message_type=MessageType.USER_QUERY,
            image_data=image_data
        )
        self.history.append(stored_msg)
        self._last_user_query = stored_msg  # Cache the last user query
        self._prune_if_needed()

    def add_tool_output(self, message: str, image_data: Optional[str] = None) -> None:
        """
        Add a tool execution result to the conversation history.
        These messages do NOT trigger memory retrieval.
        
        Note: The message should already include os_state XML with active_window, mouse_position, and time.
        ResultProcessor handles adding the os_state XML before calling this method.

        Args:
            message: Tool output message text (includes os_state XML from result_processor)
            image_data: Optional base64 image data (for screenshots)
        """
        self.history.append(StoredMessage(
            role=MessageRole.USER,
            content=message,
            message_type=MessageType.TOOL_OUTPUT,
            image_data=image_data
        ))
        self._prune_if_needed()

    def add_assistant_message(self, message: str) -> None:
        """
        Add an assistant response to the conversation history.

        Args:
            message: Assistant response text
        """
        self.history.append(StoredMessage(
            role=MessageRole.ASSISTANT,
            content=message,
            message_type=MessageType.ASSISTANT_RESPONSE,
            image_data=None
        ))
        self._prune_if_needed()

    def add_system_message(self, message: str) -> None:
        """
        Add a system message to the conversation history.

        Args:
            message: System message text
        """
        self.history.append(StoredMessage(
            role=MessageRole.SYSTEM,
            content=message,
            message_type=MessageType.ASSISTANT_RESPONSE,  # System messages are treated as responses
            image_data=None
        ))
        self._prune_if_needed()

    def get_history(self) -> List[LLMMessage]:
        """
        Get the current conversation history in LLM format.

        Converts internal StoredMessage format to LLMMessage format on-the-fly.
        This is efficient since conversion is O(n) and only called when building prompts.

        Returns:
            List of LLMMessage dicts ready for LLM consumption
        """
        return [msg.to_llm_message() for msg in self.history]
    
    def get_stored_messages(self) -> List[StoredMessage]:
        """
        Get the current conversation history as StoredMessage objects.
        
        This provides access to message_type and other structured fields
        that are lost when converting to LLMMessage format.
        
        Returns:
            List of StoredMessage objects
        """
        return list(self.history)
    
    @property
    def last_user_query(self) -> Optional[StoredMessage]:
        """
        Get the last user query message (cached for O(1) access).
        
        This avoids O(n) scanning through history when building prompts.
        
        Returns:
            Last StoredMessage with message_type USER_QUERY, or None if no user queries exist
        """
        # Verify cache is still valid (message still in history)
        if self._last_user_query and self._last_user_query in self.history:
            return self._last_user_query
        
        # Cache invalid or not set - find last user query
        for msg in reversed(self.history):
            if msg.message_type == MessageType.USER_QUERY:
                self._last_user_query = msg
                return msg
        
        self._last_user_query = None
        return None

    def clear(self) -> None:
        """Clear all conversation history."""
        self.history = []
        self._last_user_query = None

    def _prune_if_needed(self) -> None:
        """Remove the oldest messages if the history exceeds the max length."""
        if len(self.history) > self.max_length:
            # Keep the most recent messages
            removed_count = len(self.history) - self.max_length
            self.history = self.history[-self.max_length :]
            logger.debug(f"Pruned conversation history to {self.max_length} messages (removed {removed_count})")

