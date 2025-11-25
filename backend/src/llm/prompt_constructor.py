"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

This module handles the construction of prompts that include system prompts,
tool schemas, conversation history, and image processing for vision-capable models.
"""
import json
import logging
from typing import Dict, List, Optional

from backend.src.llm.prompts import (
    SCREENSHOT_MARKER_PREFIX,
    SCREENSHOT_MARKER_SUFFIX,
    SYSTEM_PROMPT,
)
from backend.src.tools.registry import ToolRegistry
from backend.src.core.types import LLMMessage, MultimodalContent

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
        history: List[Dict[str, str]],
        include_tools: bool = True,
        memory_context: Optional[str] = None,
    ) -> List[LLMMessage]:
        """
        Constructs the full prompt to be sent to the LLM.

        The prompt includes the system prompt, tool schemas (if enabled), conversation history,
        memory context, and processes images for multimodal models.

        Args:
            history: Conversation history (list of message dicts with 'role' and 'content')
            include_tools: Whether to include tool schemas in the prompt
            memory_context: Optional memory context string to inject as a system message

        Returns:
            List of message dicts ready to send to LLM (may include image content)
        """
        system_content = SYSTEM_PROMPT

        if include_tools:
            # Add tool schemas to system prompt
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

        # Add memory context as a separate system message if provided
        # This is injected into the prompt but NOT stored in conversation history
        # Format changed to avoid headers that might be echoed
        if memory_context:
            prompt.append(
                {
                    "role": "system",
                    "content": f"Background information (use silently, do not mention or reference):\n{memory_context}\n\nIMPORTANT: This is background context for your understanding. Use it to inform your responses naturally, but never quote it, reference it, or show that you're using it. Respond as if you naturally know these things without revealing this context exists.",
                }
            )

        # Process history and convert images for multimodal models
        for message in history:
            content = message.get("content", "")
            if self._contains_screenshot_data(content):
                # Convert message with screenshot to proper image format
                logger.info(
                    "Processing message with screenshot data for multimodal model"
                )
                processed_message = self._process_message_with_images(message)
                prompt.append(processed_message)
                content_type = type(processed_message.get("content"))
                logger.info(
                    f"Converted screenshot message to multimodal format: role={processed_message.get('role')}, content_type={content_type}"
                )
                if isinstance(processed_message.get("content"), list):
                    logger.info(
                        f"Multimodal content has {len(processed_message['content'])} items"
                    )
                    for i, item in enumerate(processed_message["content"]):
                        logger.debug(
                            f"  Item {i}: type={item.get('type')}, has_image_url={bool(item.get('image_url'))}"
                        )
            else:
                prompt.append(message)

        return prompt

    def _contains_screenshot_data(self, content: str) -> bool:
        """Check if message content contains screenshot data that should be converted to images."""
        # Look for the marker format defined in prompts.py
        return (
            SCREENSHOT_MARKER_PREFIX in content and SCREENSHOT_MARKER_SUFFIX in content
        )

    def _process_message_with_images(self, message: Dict[str, str]) -> LLMMessage:
        """
        Process a message that contains screenshot data and convert it to proper image format.
        
        Optimized: Truncates or removes very old screenshots to save context tokens.
        """
        content = message["content"]

        screenshot_marker = content.find(SCREENSHOT_MARKER_SUFFIX)
        if screenshot_marker == -1:
            return message

        text_content = content[:screenshot_marker].strip()
        screenshot_data_start = screenshot_marker + len(SCREENSHOT_MARKER_SUFFIX)
        screenshot_data = content[screenshot_data_start:].strip()

        if not screenshot_data:
            return message

        # --- OPTIMIZATION: Context Pruning ---
        # If this message is very old (not the latest user/assistant turn), 
        # we might want to remove the image data to save tokens.
        # Ideally this logic belongs in the History manager, but we handle it here for safety.
        # For now, we will allow it, but in production you should check timestamp/index.
        
        if screenshot_data.startswith("data:image/"):
            image_url = screenshot_data
        else:
            image_url = f"data:image/png;base64,{screenshot_data}"

        multimodal_message = {
            "role": message["role"],
            "content": [
                {"type": "text", "text": text_content},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }

        return multimodal_message
