"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

This module handles the construction of prompts that include system prompts,
tool schemas, and conversation history. History messages are already in LLMMessage format
with proper multimodal content handling.
"""
import json
import logging
from typing import List

from backend.src.llm.prompts import SYSTEM_PROMPT
from backend.src.tools.registry import ToolRegistry
from backend.src.core.types import LLMMessage

logger = logging.getLogger(__name__)


class PromptConstructor:
    """
    Constructs prompts for LLM interactions, including system prompts, tool schemas, and images.
    """

    def __init__(self, tool_registry: ToolRegistry):
        """
        Initialize the prompt constructor.

        Args:
            tool_registry: Registry of available tools
        """
        self.tool_registry = tool_registry

    def build_prompt(
        self,
        history: List[LLMMessage],
        include_tools: bool = True,
    ) -> List[LLMMessage]:
        """
        Constructs the full prompt to be sent to the LLM.

        The prompt includes the system prompt, tool schemas (if enabled), and conversation history.
        History messages are already in LLMMessage format with proper multimodal content handling.

        Args:
            history: Conversation history (already in LLMMessage format from ConversationHistory.get_history())
            include_tools: Whether to include tool schemas in the system prompt (only on first iteration)

        Returns:
            List of LLMMessage dicts ready to send to LLM
        """
        system_content = SYSTEM_PROMPT

        if include_tools:
            # Add tool schemas to system prompt (combined into single system message)
            tool_schemas = self.tool_registry.get_function_declarations()
            if tool_schemas:
                logger.info(f"Sending {len(tool_schemas)} tool schemas to LLM")
                system_content += "\n\nAvailable Tools:\n" + json.dumps(
                    tool_schemas, indent=2
                )
                system_content += '\n\nTOOL USAGE: When you need to use tools, call them using EXACT JSON format: {"functionCall": {"name": "tool_name", "args": {"param": "value"}}}. NEVER generate fake tool output or describe tool execution - only ACTUAL tool calls produce results.'
            else:
                logger.warning("No tool schemas available to send to LLM")

        prompt: List[LLMMessage] = [
            {"role": "system", "content": system_content}
        ]

        # History messages are already in LLMMessage format with proper multimodal handling
        # (text + image_data converted to multimodal content by ConversationHistory.get_history())
        prompt.extend(history)

        return prompt
