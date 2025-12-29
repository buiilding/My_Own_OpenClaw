"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

This module handles the construction of prompts using structured Prompt objects,
eliminating circular parsing patterns and preserving data integrity.
"""
import json
import logging
from typing import List, Dict, Any, Optional, Union

from backend.src.llm.prompts import SYSTEM_PROMPT
from backend.src.llm.prompt import Prompt
from backend.src.llm.prompt_metadata import PromptMetadata, UserMessageMetadata
from backend.src.tools.registry import ToolRegistry
from backend.src.core.messages import (
    MessageRole,
    MessageType,
    MultimodalContentHelper,
    UserMessageContent,
    StoredMessage,
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

    def _inject_context_into_message(self, message: LLMMessage, context_xml: str) -> LLMMessage:
        """
        Injects the context XML into the user message content.
        Handles both string content and multimodal content (list of dicts).
        """
        content = message["content"]
        
        # If content is a string, simply prepend context
        if isinstance(content, str):
            new_content = context_xml + "\n\n" + content
            return {**message, "content": new_content}
            
        # If content is a list (multimodal), find the first text part or prepend a new text part
        if isinstance(content, list):
            new_content = list(content)  # copy
            
            # Try to find the first text block to prepend to
            found_text = False
            for i, part in enumerate(new_content):
                if isinstance(part, dict) and MultimodalContentHelper.get_text(part):
                    # Extract existing text and prepend context
                    existing_text = MultimodalContentHelper.get_text(part)
                    new_content[i] = MultimodalContentHelper.create_text_content(
                        context_xml + "\n\n" + existing_text
                    )
                    found_text = True
                    break
            
            # If no text part found, prepend a new one
            if not found_text:
                new_content.insert(0, MultimodalContentHelper.create_text_content(context_xml))
                
            return {**message, "content": new_content}
            
        return message

    def build_prompt(
        self,
        history: List[LLMMessage],
        stored_messages: Optional[Union[List[StoredMessage], Any]] = None,
        include_tools: bool = True,
    ) -> tuple[List[LLMMessage], PromptMetadata]:
        """
        Constructs the full prompt using structured Prompt model.

        Args:
            history: Conversation history in LLMMessage format
            stored_messages: Optional list of StoredMessage objects or ConversationHistory instance
            include_tools: Whether to include tool schemas (only on first iteration)

        Returns:
            Tuple of (List of LLMMessage dicts ready to send to LLM, PromptMetadata object)
        """
        # Get tool schemas if needed
        tool_schemas = None
        if include_tools:
            tool_schemas = self.tool_registry.get_function_declarations()
            if tool_schemas:
                logger.info(f"Sending {len(tool_schemas)} tool schemas to LLM")
            else:
                logger.warning("No tool schemas available to send to LLM")

        # Get the last user query message using cached property (O(1) instead of O(n))
        last_user_query_stored = None
        user_query_count = 0
        
        if stored_messages:
            # Check if stored_messages is a ConversationHistory instance (has last_user_query property)
            if hasattr(stored_messages, 'last_user_query'):
                # Use cached property for O(1) access
                last_user_query_stored = stored_messages.last_user_query
                # Count user queries for determining if this is first message
                stored_list = stored_messages.get_stored_messages() if hasattr(stored_messages, 'get_stored_messages') else stored_messages
                user_query_count = sum(1 for msg in stored_list if msg.message_type == MessageType.USER_QUERY)
            elif isinstance(stored_messages, list):
                # Fallback: scan through messages (for backward compatibility)
                for stored_msg in stored_messages:
                    if stored_msg.message_type == MessageType.USER_QUERY:
                        last_user_query_stored = stored_msg
                        user_query_count += 1
        
        # Extract user query and memory sections from the last user query message
        user_query = ""
        episodic_memory = []
        semantic_memory = []
        context_xml = ""
        is_first_user_message = (user_query_count == 1)
        
        if last_user_query_stored:
            # Parse the stored message content to extract components
            # This is the ONLY place we parse - not circular since we're extracting from stored data
            content_text = last_user_query_stored.content
            try:
                user_message_content = UserMessageContent.from_string(content_text)
                user_query = user_message_content.user_query
                episodic_memory = user_message_content.episodic_memory
                semantic_memory = user_message_content.semantic_memory
            except Exception as e:
                logger.warning(f"Failed to parse user message content: {e}. Using fallback.")
                # Fallback: treat entire content as user query
                user_query = content_text.strip()
        
        # Determine context XML based on whether this is first message
        if is_first_user_message:
            context_xml = system_monitor.get_initial_state_xml()
        elif last_user_query_stored:
            context_xml = system_monitor.get_full_state_xml()
        
        # Build structured Prompt object
        prompt_obj = Prompt(
            system_prompt=self.system_prompt,
            tool_schemas=tool_schemas,
            user_query=user_query,
            episodic_memory=episodic_memory,
            semantic_memory=semantic_memory,
            context_xml=context_xml,
            history=history,
        )
        
        # Render to LLMMessage format (only place where components are combined)
        prompt_messages = prompt_obj.render_to_llm_messages()
        
        # Build metadata for transparency events
        user_message_metadata = None
        if last_user_query_stored:
            # Get full content after rendering (for transparency)
            # Find the LAST user message (the one we just built with context injection)
            full_content = ""
            for msg in reversed(prompt_messages):
                if msg["role"] == MessageRole.USER.value:
                    text_content = MultimodalContentHelper.get_text(msg["content"])
                    # Check if this is the user query we just built (has <user_query> tag)
                    if "<user_query>" in text_content:
                        full_content = text_content
                        break
            
            user_message_metadata = UserMessageMetadata(
                original_query=user_query,
                full_content=full_content,
                context_type="initial" if is_first_user_message else "full",
                injected_context=context_xml,
                active_window=system_monitor.get_active_window(),
            )
        
        metadata = PromptMetadata(
            system_prompt=prompt_obj.system_prompt,
            tool_schemas=tool_schemas,
            user_message_metadata=user_message_metadata,
        )
        
        return prompt_messages, metadata
