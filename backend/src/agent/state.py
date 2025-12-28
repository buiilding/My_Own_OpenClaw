"""
Conversation History Manager for maintaining conversation state.

This module manages the conversation history, including pruning to prevent
context window overflow.
"""

import logging
from typing import Dict, List, Optional, Union
from backend.src.core.types import LLMMessage, MultimodalContent
# Removed unused imports - active window is now included in system_context XML

logger = logging.getLogger(__name__)


class ConversationHistory:
    """
    Manages conversation history with automatic pruning.
    
    History stores messages in internal format: dict with "role", "message", and optional "image_data".
    When retrieving history, converts to LLMMessage format for LLM consumption.
    """

    def __init__(self, max_length: int = 10):
        """
        Initialize the conversation history.

        Args:
            max_length: Maximum number of messages to keep in history
        """
        # Internal format: List[Dict] with keys: "role", "message", "image_data" (optional)
        self.history: List[Dict[str, Union[str, Optional[str]]]] = []
        self.max_length = max_length

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
        self.history.append({
            "role": "user",
            "message": message,  # Message already has <user_query> and memory sections
            "image_data": image_data
        })
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
        self.history.append({
            "role": "user",
            "message": message,
            "image_data": image_data
        })
        self._prune_if_needed()

    def add_assistant_message(self, message: str) -> None:
        """
        Add an assistant response to the conversation history.

        Args:
            message: Assistant response text
        """
        self.history.append({
            "role": "assistant",
            "message": message,
            "image_data": None
        })
        self._prune_if_needed()

    def add_system_message(self, message: str) -> None:
        """
        Add a system message to the conversation history.

        Args:
            message: System message text
        """
        self.history.append({
            "role": "system",
            "message": message,
            "image_data": None
        })
        self._prune_if_needed()

    def get_history(self) -> List[LLMMessage]:
        """
        Get the current conversation history in LLM format.

        Converts internal format to LLMMessage format on-the-fly.
        This is efficient since conversion is O(n) and only called when building prompts.

        Returns:
            List of LLMMessage dicts ready for LLM consumption
        """
        llm_messages: List[LLMMessage] = []
        
        for msg in self.history:
            role = msg["role"]
            message_text = msg["message"]
            image_data = msg.get("image_data")
            
            if image_data:
                # Convert to multimodal format
                if not image_data.startswith("data:image/"):
                    image_url = f"data:image/png;base64,{image_data}"
                else:
                    image_url = image_data
                
                multimodal_content: MultimodalContent = [
                    {"type": "text", "text": message_text},
                    {"type": "image_url", "image_url": {"url": image_url}}
                ]
                
                llm_messages.append({
                    "role": role,
                    "content": multimodal_content
                })
            else:
                # Simple text message
                llm_messages.append({
                    "role": role,
                    "content": message_text
                })
        
        return llm_messages

    def clear(self) -> None:
        """Clear all conversation history."""
        self.history = []

    def _prune_if_needed(self) -> None:
        """Remove the oldest messages if the history exceeds the max length."""
        if len(self.history) > self.max_length:
            # Keep the most recent messages
            removed_count = len(self.history) - self.max_length
            self.history = self.history[-self.max_length :]
            logger.debug(f"Pruned conversation history to {self.max_length} messages (removed {removed_count})")

