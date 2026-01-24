"""
Message content converters.

This module provides utilities for converting between different message content formats.
"""
from typing import Union

from backend.src.core.messages.structures import ImageContent, MessageContent, TextContent
from backend.src.core.types.enums import ContentType
from backend.src.core.types.schemas import MultimodalContent


def content_to_message_content(content: Union[str, MultimodalContent]) -> MessageContent:
    """
    Convert raw LLMMessage content to MessageContent object.
    
    Args:
        content: Raw content from LLMMessage (str or MultimodalContent)
        
    Returns:
        MessageContent instance
    """
    if isinstance(content, str):
        return TextContent(content)
    elif isinstance(content, list):
        text_parts = []
        image_urls = []
        for part in content:
            if isinstance(part, dict):
                if part.get("type") == ContentType.TEXT.value:
                    text_parts.append(part.get("text", ""))
                elif part.get("type") == ContentType.IMAGE_URL.value:
                    image_url_dict = part.get("image_url", {})
                    if isinstance(image_url_dict, dict):
                        url = image_url_dict.get("url")
                        if url:
                            image_urls.append(url)
        
        text = " ".join(text_parts)
        if image_urls:
            return ImageContent(text, image_urls[0])  # Use first image
        return TextContent(text)
    return TextContent(str(content))
