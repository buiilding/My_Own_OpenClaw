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
    Maintains a cached LLMMessage format for O(1) retrieval instead of O(n) conversion.
    """

    def __init__(self, max_length: Optional[int] = 10, system_prompt: Optional[str] = None):
        """
        Initialize the conversation history.

        Args:
            max_length: Maximum number of messages to keep in history
            system_prompt: System prompt to store and include in history
        """
        # Internal format: List of StoredMessage instances
        self.history: List[StoredMessage] = []
        # Cached LLM format for O(1) retrieval (updated incrementally)
        self._llm_history_cache: List[LLMMessage] = []
        self.max_length = max_length
        self.system_prompt: Optional[str] = system_prompt

        # If max_length is None, disable pruning
        if self.max_length is None:
            self.max_length = float('inf')

    def add_user_message(
        self,
        content: str,
        image_data: Optional[str] = None,
        episodic_memory: Optional[List[str]] = None,
        semantic_memory: Optional[List[str]] = None,
        user_query_raw: Optional[str] = None,
    ) -> None:
        """
        Add an actual user message to the conversation history.
        Content includes context XML, memory sections, and user query.
        For the first message only, tool schemas are embedded in content as a <tool_schemas> XML section.

        Args:
            content: Message content (context + memory + query, WITH tool schemas for first message only)
            image_data: Optional base64 image data
            episodic_memory: Optional list of episodic memory strings (structured data)
            semantic_memory: Optional list of semantic memory strings (structured data)
            user_query_raw: Optional raw user query text (structured data)
        """
        stored_msg = StoredMessage(
            role=MessageRole.USER,
            content=content,  # Content without tool schemas
            message_type=MessageType.USER_QUERY,
            image_data=image_data,
            episodic_memory=episodic_memory,
            semantic_memory=semantic_memory,
            user_query_raw=user_query_raw,
        )
        self.history.append(stored_msg)
        # Convert and append to LLM cache immediately (O(1) per message)
        llm_msg = stored_msg.to_llm_message()
        self._llm_history_cache.append(llm_msg)
        self._prune_if_needed()

    def add_tool_output(self, message: str, image_data: Optional[str] = None) -> None:
        """
        Add a tool execution result to the conversation history.
        These messages do NOT trigger memory retrieval.
        
        Tool outputs are stored with their screenshots (if available) and included
        in conversation history. Screenshots are automatically converted to multimodal
        format when history is retrieved for LLM consumption.
        
        Note: The message must include os_state XML with active_window, mouse_position, and time.
        Frontend pre-formats messages with system context XML embedded in llm_content.
        ResultTransformer passes pre-formatted messages through.

        Args:
            message: Tool output message text (pre-formatted by frontend with os_state XML)
            image_data: Optional base64 image data (for screenshots). Automatically captured
                       by the frontend after tool execution. Included in history
                       and sent to LLM as multimodal content.
        """
        stored_msg = StoredMessage(
            role=MessageRole.USER,
            content=message,
            message_type=MessageType.TOOL_OUTPUT,
            image_data=image_data  # Screenshots are stored here and included in LLM history
        )
        self.history.append(stored_msg)
        # Convert and append to LLM cache immediately (O(1) per message)
        llm_msg = stored_msg.to_llm_message()
        self._llm_history_cache.append(llm_msg)
        self._prune_if_needed()

    def add_assistant_message(self, message: str) -> None:
        """
        Add an assistant response to the conversation history.

        Args:
            message: Assistant response text
        """
        stored_msg = StoredMessage(
            role=MessageRole.ASSISTANT,
            content=message,
            message_type=MessageType.ASSISTANT_RESPONSE,
            image_data=None
        )
        self.history.append(stored_msg)
        # Convert and append to LLM cache immediately (O(1) per message)
        llm_msg = stored_msg.to_llm_message()
        self._llm_history_cache.append(llm_msg)
        self._prune_if_needed()

    def get_history(self) -> List[LLMMessage]:
        """
        Get the current conversation history in LLM format.

        Returns cached LLM format (O(1) instead of O(n) conversion).
        Includes system prompt if stored. Tool outputs with screenshots are automatically
        converted to multimodal format (text + image) for LLM consumption.

        Returns:
            List of LLMMessage dicts ready for LLM consumption.
            Messages with image_data are converted to multimodal format with both
            text content and image_url.
        """
        messages: List[LLMMessage] = []

        # Include system prompt first if stored
        if self.system_prompt:
            messages.append({
                "role": MessageRole.SYSTEM.value,
                "content": self.system_prompt
            })

        # Return cached LLM format (O(1) instead of O(n) conversion)
        messages.extend(self._llm_history_cache)

        return messages
    
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
        Get the last user query message.
        
        Returns:
            Last StoredMessage with message_type USER_QUERY, or None if no user queries exist
        """
        # Find last user query (typically near end, so reverse scan is fast)
        for msg in reversed(self.history):
            if msg.message_type == MessageType.USER_QUERY:
                return msg
        return None

    def clear(self) -> None:
        """Clear all conversation history."""
        self.history = []
        self._llm_history_cache = []
        # Note: system_prompt is preserved on clear

    def _prune_if_needed(self) -> None:
        """Remove the oldest messages if the history exceeds the max length."""
        if len(self.history) > self.max_length:
            # Keep the most recent messages (prune both lists in sync)
            removed_count = len(self.history) - self.max_length
            self.history = self.history[-self.max_length :]
            self._llm_history_cache = self._llm_history_cache[-self.max_length :]
            logger.debug(f"Pruned conversation history to {self.max_length} messages (removed {removed_count})")

