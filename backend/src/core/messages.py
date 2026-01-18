"""
Message structures and helpers for conversation history.

This module provides structured message types and utilities for handling
multimodal content and message parsing.
"""
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from backend.src.core.types import (
    ContentType,
    LLMMessage,
    MessageRole,
    MessageType,
    MultimodalContent,
)


@dataclass
class StoredMessage:
    """
    Structured representation of a message in conversation history.
    
    Replaces the internal Dict format used in ConversationHistory to provide
    type safety and explicit message type information.
    
    For user query messages, structured components are stored separately to avoid
    destructive data flow (storing rendered XML then parsing it back).
    """
    role: MessageRole
    content: str  # Rendered content for backward compatibility and LLM consumption
    message_type: MessageType
    timestamp: float = field(default_factory=time.time)
    image_data: Optional[str] = None
    # Structured components for user query messages (None for other message types)
    user_query_raw: Optional[str] = None
    episodic_memory: Optional[List[str]] = None
    semantic_memory: Optional[List[str]] = None
    injected_context: Optional[str] = None
    
    def to_llm_message(self) -> LLMMessage:
        """
        Convert StoredMessage to LLMMessage format for LLM consumption.

        If image_data is present (e.g., screenshots from tool outputs), converts to
        multimodal format with both text content and image_url. This ensures screenshots
        are included in conversation history sent to the LLM.

        Returns:
            LLMMessage dict ready for LLM API.
            If image_data exists, returns multimodal content with text and image.
            Otherwise, returns simple text content.
        """
        if self.image_data:
            # Convert to multimodal format - screenshots are included here
            if not self.image_data.startswith("data:image/"):
                image_url = f"data:image/png;base64,{self.image_data}"
            else:
                image_url = self.image_data

            multimodal_content: MultimodalContent = [
                {"type": ContentType.TEXT.value, "text": self.content},
                {"type": ContentType.IMAGE_URL.value, "image_url": {"url": image_url}}
            ]

            return {
                "role": self.role.value,
                "content": multimodal_content
            }
        else:
            # Simple text message
            return {
                "role": self.role.value,
                "content": self.content
            }


class MessageContent(ABC):
    """
    Abstract base class for message content types.
    
    Replaces MultimodalContentHelper with proper type hierarchy for type safety.
    """
    
    @abstractmethod
    def to_llm_format(self) -> Union[str, MultimodalContent]:
        """Convert to LLMMessage content format."""
        pass
    
    def get_text(self) -> str:
        """Extract text content."""
        return ""
    
    def has_image(self) -> bool:
        """Check if content contains image data."""
        return False
    
    def get_image_urls(self) -> List[str]:
        """Extract image URLs from content."""
        return []


class TextContent(MessageContent):
    """Text-only message content."""
    
    def __init__(self, text: str):
        self.text = text
    
    def to_llm_format(self) -> str:
        return self.text
    
    def get_text(self) -> str:
        return self.text


class ImageContent(MessageContent):
    """Multimodal message content with text and image."""
    
    def __init__(self, text: str, image_url: str):
        self.text = text
        self.image_url = image_url
    
    def to_llm_format(self) -> MultimodalContent:
        return [
            {"type": ContentType.TEXT.value, "text": self.text},
            {"type": ContentType.IMAGE_URL.value, "image_url": {"url": self.image_url}}
        ]
    
    def get_text(self) -> str:
        return self.text
    
    def has_image(self) -> bool:
        return True
    
    def get_image_urls(self) -> List[str]:
        return [self.image_url]


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
