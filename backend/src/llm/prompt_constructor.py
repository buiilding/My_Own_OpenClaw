"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

This module handles the construction of prompts using structured Prompt objects,
eliminating circular parsing patterns and preserving data integrity.
"""
import json
import logging
from typing import List, Dict, Any, Optional, Union

from backend.src.llm.prompts import SYSTEM_PROMPT
from backend.src.llm.prompt_metadata import PromptMetadata, UserMessageMetadata
from backend.src.tools.registry import ToolRegistry
from backend.src.core.messages import (
    MessageRole,
    MessageType,
    StoredMessage,
    content_to_message_content,
)
from backend.src.core.types import LLMMessage
from backend.src.services.system_monitor import system_monitor

logger = logging.getLogger(__name__)


class PromptConstructor:
    """
    Constructs prompts for LLM interactions, including system prompts, tool schemas, and images.
    """

    def __init__(self, tool_registry: ToolRegistry, system_prompt: str = SYSTEM_PROMPT):
        """
        Initialize the prompt constructor.

        Args:
            tool_registry: Registry of available tools
            system_prompt: Optional custom system prompt (defaults to global SYSTEM_PROMPT)
        """
        self.tool_registry = tool_registry
        self.system_prompt = system_prompt

    def build_prompt(
        self,
        history: List[LLMMessage],
        stored_messages: Optional[Union[List[StoredMessage], Any]] = None,
        include_tools: bool = True,
    ) -> tuple[List[LLMMessage], List[Dict[str, Any]], PromptMetadata]:
        """
        Constructs the full prompt from stored history.

        Gets conversation history and returns tool schemas as separate parameters
        for the LLM API call (tools parameter and messages parameter).

        Args:
            history: Unused (kept for compatibility)
            stored_messages: ConversationHistory instance - provides conversation history
            include_tools: Whether to include tool schemas (always True)

        Returns:
            Tuple of (List of LLMMessage dicts ready to send to LLM, List of tool schemas for LLM API, PromptMetadata object)
        """
        # Get tool schemas if needed
        tool_schemas = []
        if include_tools:
            tool_schemas = self.tool_registry.get_function_declarations() or []

        # Get history (tools passed separately to LLM API)
        if stored_messages and hasattr(stored_messages, 'get_history'):
            prompt_messages = stored_messages.get_history()
        else:
            # Fallback to provided history
            prompt_messages = history

        # Build metadata for transparency events
        user_message_metadata = None

        if stored_messages and hasattr(stored_messages, 'last_user_query'):
            last_user_query_stored = stored_messages.last_user_query
            if last_user_query_stored:
                # Extract metadata from stored message
                user_query = last_user_query_stored.user_query_raw or ""

                # Find the last user message in rendered history for full content
                full_content = ""
                for msg in reversed(prompt_messages):
                    if msg["role"] == MessageRole.USER.value:
                        msg_content = content_to_message_content(msg["content"])
                        text_content = msg_content.get_text()
                        if "<user_query>" in text_content:
                            full_content = text_content
                            break

                # Determine context type and extract context XML from content
                stored_list = stored_messages.get_stored_messages()
                user_query_count = sum(1 for msg in stored_list if msg.message_type == MessageType.USER_QUERY)
                is_first_user_message = (user_query_count == 1)

                # Extract context XML from message content
                context_xml = ""
                if full_content:
                    # Try to extract context XML from the message content
                    if "<system_context>" in full_content:
                        start_idx = full_content.find("<system_context>")
                        end_idx = full_content.find("</system_context>") + len("</system_context>")
                        if end_idx > start_idx:
                            context_xml = full_content[start_idx:end_idx]

                user_message_metadata = UserMessageMetadata(
                    original_query=user_query,
                    full_content=full_content,
                    context_type="initial" if is_first_user_message else "full",
                    injected_context=context_xml,
                    active_window=system_monitor.get_active_window(),
                )

        metadata = PromptMetadata(
            system_prompt=self.system_prompt,
            tool_schemas=tool_schemas,
            user_message_metadata=user_message_metadata,
        )

        return prompt_messages, tool_schemas, metadata
