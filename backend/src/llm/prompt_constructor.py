"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

This module handles the construction of prompts that include system prompts,
tool schemas, and conversation history. History messages are already in LLMMessage format
with proper multimodal content handling.
"""
import json
import logging
import re
from typing import List, Dict, Any, Union

from backend.src.llm.prompts import SYSTEM_PROMPT
from backend.src.tools.registry import ToolRegistry
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
                if isinstance(part, dict) and part.get("type") == "text":
                    new_content[i] = {
                        "type": "text",
                        "text": context_xml + "\n\n" + part["text"]
                    }
                    found_text = True
                    break
            
            # If no text part found, prepend a new one
            if not found_text:
                new_content.insert(0, {
                    "type": "text",
                    "text": context_xml
                })
                
            return {**message, "content": new_content}
            
        return message

    def build_prompt(
        self,
        history: List[LLMMessage],
        include_tools: bool = True,
    ) -> tuple[List[LLMMessage], Dict[str, Any]]:
        """
        Constructs the full prompt to be sent to the LLM.

        The prompt includes tool schemas (if enabled), tool usage instructions, system prompt, and conversation history.
        History messages are already in LLMMessage format with proper multimodal content handling.

        Args:
            history: Conversation history (already in LLMMessage format from ConversationHistory.get_history())
            include_tools: Whether to include tool schemas in the system prompt (only on first iteration)

        Returns:
            Tuple of (List of LLMMessage dicts ready to send to LLM, metadata dict)
        """
        system_content = ""
        tool_schemas = None
        user_message_metadata = None  # Initialize to avoid NameError

        if include_tools:
            # Add tool schemas to system prompt (combined into single system message)
            tool_schemas = self.tool_registry.get_function_declarations()
            if tool_schemas:
                logger.info(f"Sending {len(tool_schemas)} tool schemas to LLM")
                system_content += "Available Tools:\n" + json.dumps(
                    tool_schemas, indent=2
                )
                system_content += '\n\nTOOL USAGE: When you need to use tools, call them using EXACT JSON format: {"functionCall": {"name": "tool_name", "args": {"param": "value"}}}. NEVER generate fake tool output or describe tool execution - only ACTUAL tool calls produce results.'
                system_content += "\n\n" + self.system_prompt
            else:
                logger.warning("No tool schemas available to send to LLM")
                system_content = self.system_prompt
        else:
            system_content = self.system_prompt

        prompt: List[LLMMessage] = [
            {"role": "system", "content": system_content}
        ]

        # Process history to inject dynamic context
        # Strategy:
        # 1. For the FIRST user message in conversation, inject comprehensive INITIAL state (all windows + system stats)
        # 2. For subsequent user messages, inject regular FULL state (active window, mouse, etc.)
        # 3. Tool output messages already have os_state XML included in result_processor.py

        processed_history = []
        user_message_metadata = None

        # Find the last actual user query message (not tool output)
        # Tool outputs are also "user" role but don't have <user_query> tags
        last_user_query_msg = None
        last_user_query_idx = -1
        user_query_count = 0
        
        for i, msg in enumerate(history):
            if msg["role"] == "user":
                # Check if this is an actual user query (has <user_query> tags) vs tool output
                content = msg["content"]
                if isinstance(content, str):
                    has_user_query_tag = "<user_query>" in content
                elif isinstance(content, list):
                    text_parts = [part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"]
                    full_text = " ".join(text_parts)
                    has_user_query_tag = "<user_query>" in full_text
                else:
                    has_user_query_tag = False
                
                if has_user_query_tag:
                    last_user_query_msg = msg
                    last_user_query_idx = i
                    user_query_count += 1

        for i, msg in enumerate(history):
            is_last_message = (i == len(history) - 1)
            is_last_user_query = (i == last_user_query_idx)

            # Only process actual user query messages (not tool outputs)
            if is_last_user_query and msg["role"] == "user" and last_user_query_msg:
                # Check if this is the first user message (initial message)
                is_first_user_message = (user_query_count == 1)

                # Extract original user query (just the query, not memory sections)
                original_content = msg["content"]
                if isinstance(original_content, str):
                    # Extract just the <user_query>...</user_query> part, excluding memory sections
                    user_query_match = re.search(r'<user_query>(.*?)</user_query>', original_content, re.DOTALL)
                    if user_query_match:
                        original_text = user_query_match.group(1).strip()
                    else:
                        # This shouldn't happen if we checked has_user_query_tag, but fallback anyway
                        original_text = original_content
                        # Remove episodic and semantic memory sections
                        original_text = re.sub(r'<episodic_memory>.*?</episodic_memory>', '', original_text, flags=re.DOTALL)
                        original_text = re.sub(r'<semantic_memory>.*?</semantic_memory>', '', original_text, flags=re.DOTALL)
                        original_text = original_text.strip()
                elif isinstance(original_content, list):
                    # Extract text from multimodal content
                    text_parts = [part.get("text", "") for part in original_content if isinstance(part, dict) and part.get("type") == "text"]
                    full_text = " ".join(text_parts)
                    # Extract just the user query part
                    user_query_match = re.search(r'<user_query>(.*?)</user_query>', full_text, re.DOTALL)
                    if user_query_match:
                        original_text = user_query_match.group(1).strip()
                    else:
                        original_text = full_text.strip()
                else:
                    original_text = str(original_content)

                if is_first_user_message:
                    # Use comprehensive initial state with all windows and system stats
                    initial_state_xml = system_monitor.get_initial_state_xml()
                    processed_msg = self._inject_context_into_message(msg, initial_state_xml)
                    processed_history.append(processed_msg)
                    
                    # Extract full content after injection
                    injected_content = processed_msg["content"]
                    if isinstance(injected_content, str):
                        full_content = injected_content
                    elif isinstance(injected_content, list):
                        text_parts = [part.get("text", "") for part in injected_content if isinstance(part, dict) and part.get("type") == "text"]
                        full_content = " ".join(text_parts)
                    else:
                        full_content = str(injected_content)
                    
                    user_message_metadata = {
                        "original_query": original_text,
                        "full_content": full_content,
                        "context_type": "initial",
                        "injected_context": initial_state_xml,
                        "active_window": system_monitor.get_active_window(),
                    }
                else:
                    # Use regular full state for subsequent messages
                    full_state_xml = system_monitor.get_full_state_xml()
                    processed_msg = self._inject_context_into_message(msg, full_state_xml)
                    processed_history.append(processed_msg)
                    
                    # Extract full content after injection
                    injected_content = processed_msg["content"]
                    if isinstance(injected_content, str):
                        full_content = injected_content
                    elif isinstance(injected_content, list):
                        text_parts = [part.get("text", "") for part in injected_content if isinstance(part, dict) and part.get("type") == "text"]
                        full_content = " ".join(text_parts)
                    else:
                        full_content = str(injected_content)
                    
                    user_message_metadata = {
                        "original_query": original_text,
                        "full_content": full_content,
                        "context_type": "full",
                        "injected_context": full_state_xml,
                        "active_window": system_monitor.get_active_window(),
                    }

            else:
                # Tool output messages already have os_state XML included in result_processor.py
                # No need to inject again here
                processed_history.append(msg)

        prompt.extend(processed_history)

        metadata = {
            "system_prompt": system_content,
            "tool_schemas": tool_schemas,
            "user_message_metadata": user_message_metadata,
        }

        return prompt, metadata
