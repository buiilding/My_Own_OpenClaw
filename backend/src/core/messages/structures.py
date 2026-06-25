"""
Message structures for conversation history.

This module provides structured message types for handling
multimodal content and message parsing.
"""

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from backend.src.core.messages.image_payloads import normalize_provider_image_data_url
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
    content: str  # Rendered provider-facing content.
    message_type: MessageType
    structured_content: Optional[MultimodalContent] = None
    timestamp: float = field(default_factory=time.time)
    image_data: Optional[Union[str, List[str]]] = None
    image_refs: Optional[List[str]] = None
    image_owner_user_id: Optional[str] = None
    # Structured components for user query messages (None for other message types)
    user_query_raw: Optional[str] = None
    episodic_memory: Optional[List[str]] = None
    semantic_memory: Optional[List[str]] = None
    injected_context: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    tool_name: Optional[str] = None
    compaction_facts: Optional[Dict[str, Any]] = None

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
                "content": self._provider_content(),
                "tool_calls": self._normalize_tool_calls(self.tool_calls),
            }
            if self.tool_name:
                assistant_message["name"] = self.tool_name
            return assistant_message

        if self.role == MessageRole.TOOL:
            tool_message: Dict[str, Any] = {
                "role": self.role.value,
                "content": self._provider_content(),
                "tool_call_id": self.tool_call_id or "unknown_tool_call",
            }
            if self.tool_name:
                tool_message["name"] = self.tool_name
            return tool_message

        message_content = self._provider_content()
        return {
            "role": self.role.value,
            "content": message_content,
        }

    def _provider_content(self) -> Union[str, MultimodalContent]:
        """Return provider-facing content while preserving optional structured history."""
        if self.image_data:
            return self._build_multimodal_content(self.content, self.image_data)
        if self.structured_content is not None:
            return self.structured_content
        return self.content

    @staticmethod
    def _normalized_image_refs(image_refs: Optional[List[str]]) -> List[str]:
        """Return non-empty artifact refs from a stored prompt image ref list."""
        if not isinstance(image_refs, list):
            return []
        return [
            image_ref.strip()
            for image_ref in image_refs
            if isinstance(image_ref, str) and image_ref.strip()
        ]

    @staticmethod
    def _normalized_image_data(
        image_data: Optional[Union[str, List[str]]]
    ) -> List[str]:
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
            image_url = normalize_provider_image_data_url(image_item)
            if not image_url:
                continue
            multimodal_content.append(
                {"type": ContentType.IMAGE_URL.value, "image_url": {"url": image_url}}
            )
        if len(multimodal_content) == 1:
            return text
        return multimodal_content

    @staticmethod
    def _normalize_tool_calls(tool_calls: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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
            normalized_call: Dict[str, Any] = {
                "id": call_id,
                "name": name,
                "arguments": dict(arguments),
            }
            for key in ("thought_signature", "thoughtSignature"):
                thought_signature = call.get(key)
                if isinstance(thought_signature, str) and thought_signature.strip():
                    normalized_call["thought_signature"] = thought_signature.strip()
                    break
            normalized_calls.append(normalized_call)
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
    """Multimodal message content with text and one or more images."""

    def __init__(self, text: str, image_url: Union[str, List[str]]):
        self.text = text
        if isinstance(image_url, list):
            self.image_urls = [url for url in image_url if isinstance(url, str) and url]
        elif isinstance(image_url, str) and image_url:
            self.image_urls = [image_url]
        else:
            self.image_urls = []
        self.image_url = self.image_urls[0] if self.image_urls else ""

    def to_llm_format(self) -> MultimodalContent:
        content: MultimodalContent = [
            {"type": ContentType.TEXT.value, "text": self.text},
        ]
        for image_url in self.image_urls:
            content.append(
                {"type": ContentType.IMAGE_URL.value, "image_url": {"url": image_url}}
            )
        return content

    def get_text(self) -> str:
        return self.text

    def has_image(self) -> bool:
        return bool(self.image_urls)

    def get_image_urls(self) -> List[str]:
        return list(self.image_urls)
