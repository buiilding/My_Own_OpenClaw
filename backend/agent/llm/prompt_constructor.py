"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

This module handles the construction of prompts that include system prompts,
tool schemas, conversation history, and image processing for vision-capable models.
"""

import json
import logging
from typing import Any, Dict, List, Union

from backend.agent.prompts import (
    SCREENSHOT_MARKER_PREFIX,
    SCREENSHOT_MARKER_SUFFIX,
    SYSTEM_PROMPT,
)
from backend.tools.registry import ToolRegistry

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
        self, history: List[Dict[str, str]], include_tools: bool = True
    ) -> List[Union[Dict[str, str], Dict[str, Any]]]:
        """
        Constructs the full prompt to be sent to the LLM.

        The prompt includes the system prompt, tool schemas (if enabled), conversation history,
        and processes images for multimodal models.

        Args:
            history: Conversation history (list of message dicts with 'role' and 'content')
            include_tools: Whether to include tool schemas in the prompt

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
                system_content += '\n\nTOOL USAGE: When you need to use tools, call them using function syntax: tool_name(param="value")'
            else:
                logger.warning("No tool schemas available to send to LLM")

        prompt: List[Union[Dict[str, str], Dict[str, Any]]] = [
            {"role": "system", "content": system_content}
        ]

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

    def _process_message_with_images(self, message: Dict[str, str]) -> Dict[str, Any]:
        """
        Process a message that contains screenshot data and convert it to proper image format.

        For multimodal models, this extracts base64 screenshot data and creates the proper
        multimodal message format that LiteLLM expects.
        """
        content = message["content"]

        # Extract text content (everything before screenshot data)
        # Format defined in prompts.py: SCREENSHOT_MARKER_PREFIX {tool_name} SCREENSHOT_MARKER_SUFFIX{screenshot_data}
        screenshot_marker = content.find(SCREENSHOT_MARKER_SUFFIX)
        if screenshot_marker == -1:
            logger.warning(
                f"Screenshot marker '{SCREENSHOT_MARKER_SUFFIX}' not found in message content"
            )
            return message

        text_content = content[:screenshot_marker].strip()

        # Extract base64 screenshot data (everything after the marker suffix)
        screenshot_data_start = screenshot_marker + len(SCREENSHOT_MARKER_SUFFIX)
        screenshot_data = content[screenshot_data_start:].strip()

        if not screenshot_data:
            logger.warning("No screenshot data found after marker")
            return message

        # Ensure base64 data has proper data URI format
        # Check if it already has the data URI prefix
        if screenshot_data.startswith("data:image/"):
            image_url = screenshot_data
        else:
            # Add the data URI prefix if missing
            image_url = f"data:image/png;base64,{screenshot_data}"

        # Create multimodal message format - LiteLLM normalizes all providers
        # Use standard OpenAI-compatible format for all multimodal models
        multimodal_message = {
            "role": message["role"],
            "content": [
                {"type": "text", "text": text_content},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }

        logger.info(
            f"Created multimodal message with screenshot: text_length={len(text_content)}, screenshot_length={len(screenshot_data)}, image_url_prefix={image_url[:50]}..."
        )
        return multimodal_message
