"""
Conversation History Manager for maintaining conversation state.

This module manages the conversation history, including pruning to prevent
context window overflow.
"""

import logging
from typing import Dict, List

logger = logging.getLogger(__name__)

# The maximum number of messages to keep in the conversation history.
MAX_HISTORY_LENGTH = 10


class ConversationHistory:
    """
    Manages conversation history with automatic pruning.
    """

    def __init__(self, max_length: int = MAX_HISTORY_LENGTH):
        """
        Initialize the conversation history.

        Args:
            max_length: Maximum number of messages to keep in history
        """
        self.history: List[Dict[str, str]] = []
        self.max_length = max_length

    def add_message(self, role: str, content: str) -> None:
        """
        Add a message to the conversation history.

        Args:
            role: Message role ('user', 'assistant', 'system')
            content: Message content
        """
        self.history.append({"role": role, "content": content})
        self._prune_if_needed()

    def add_messages(self, messages: List[Dict[str, str]]) -> None:
        """
        Add multiple messages to the conversation history.

        Args:
            messages: List of message dicts with 'role' and 'content'
        """
        self.history.extend(messages)
        self._prune_if_needed()

    def get_history(self) -> List[Dict[str, str]]:
        """
        Get the current conversation history.

        Returns:
            List of message dicts
        """
        return self.history.copy()

    def clear(self) -> None:
        """Clear all conversation history."""
        self.history = []

    def _prune_if_needed(self) -> None:
        """Remove the oldest messages if the history exceeds the max length."""
        if len(self.history) > self.max_length:
            # Keep the most recent messages
            self.history = self.history[-self.max_length :]
            logger.debug(f"Pruned conversation history to {self.max_length} messages")
