"""
Message structures for conversation history.

This module provides structured message types for handling
multimodal content and message parsing.
"""
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from backend.src.core.types.enums import ContentType, MessageRole, MessageType
from backend.src.core.types.schemas import LLMMessage, MultimodalContent


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
    image_data: Optional[Union[str, List[str]]] = None
    # Structured components for user query messages (None for other message types)
    user_query_raw: Optional[str] = None
    episodic_memory: Optional[List[str]] = None
    semantic_memory: Optional[List[str]] = None
    injected_context: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    tool_name: Optional[str] = None
    
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
        if self.role == MessageRole.ASSISTANT and self.tool_calls:
            assistant_message: Dict[str, Any] = {
                "role": self.role.value,
                "content": self.content,
                "tool_calls": self._normalize_tool_calls(self.tool_calls),
            }
            if self.tool_name:
                assistant_message["name"] = self.tool_name
            return assistant_message

        if self.role == MessageRole.TOOL:
            tool_content: Union[str, MultimodalContent] = self._build_multimodal_content(
                self.content,
                self.image_data,
            )

            tool_message: Dict[str, Any] = {
                "role": self.role.value,
                "content": tool_content,
                "tool_call_id": self.tool_call_id or "unknown_tool_call",
            }
            if self.tool_name:
                tool_message["name"] = self.tool_name
            return tool_message

        message_content = self._build_multimodal_content(self.content, self.image_data)
        return {
            "role": self.role.value,
            "content": message_content,
        }

    @staticmethod
    def _normalized_image_data(image_data: Optional[Union[str, List[str]]]) -> List[str]:
        """Return validated image payload list from a single or multi-image field."""
        if isinstance(image_data, str):
            return [image_data] if image_data else []
        if isinstance(image_data, list):
            return [
                image_item
                for image_item in image_data
                if isinstance(image_item, str) and image_item
            ]
        return []

    @classmethod
    def _build_multimodal_content(
        cls,
        text: str,
        image_data: Optional[Union[str, List[str]]],
    ) -> Union[str, MultimodalContent]:
        """
        Convert text + optional image payload(s) into LLM multimodal content.
        """
        normalized_image_data = cls._normalized_image_data(image_data)
        if not normalized_image_data:
            return text

        multimodal_content: MultimodalContent = [
            {"type": ContentType.TEXT.value, "text": text},
        ]
        for image_item in normalized_image_data:
            image_url = (
                image_item
                if image_item.startswith("data:image/")
                else f"data:image/png;base64,{image_item}"
            )
            multimodal_content.append(
                {"type": ContentType.IMAGE_URL.value, "image_url": {"url": image_url}}
            )
        return multimodal_content

    @staticmethod
    def _normalize_tool_calls(
        tool_calls: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Normalize assistant tool_calls payload for history serialization."""
        normalized_calls: List[Dict[str, Any]] = []
        for index, call in enumerate(tool_calls):
            if not isinstance(call, dict):
                continue
            call_id = call.get("id")
            if not isinstance(call_id, str) or not call_id:
                call_id = f"tool_call_{index}"
            name = call.get("name")
            if not isinstance(name, str) or not name:
                name = "unknown_tool"
            arguments = call.get("arguments")
            if not isinstance(arguments, dict):
                arguments = {}
            normalized_calls.append(
                {
                    "id": call_id,
                    "name": name,
                    "arguments": dict(arguments),
                }
            )
        return normalized_calls


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
