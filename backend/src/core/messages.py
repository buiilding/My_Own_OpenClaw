"""
Message structures and helpers for conversation history.

This module provides structured message types and utilities for handling
multimodal content and message parsing.
"""
import time
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
    """
    role: MessageRole
    content: str
    message_type: MessageType
    timestamp: float = field(default_factory=time.time)
    image_data: Optional[str] = None
    
    def to_llm_message(self) -> LLMMessage:
        """
        Convert StoredMessage to LLMMessage format for LLM consumption.
        
        Returns:
            LLMMessage dict ready for LLM API
        """
        if self.image_data:
            # Convert to multimodal format
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


class MultimodalContentHelper:
    """
    Helper class for extracting and manipulating multimodal content.
    
    Centralizes the logic for extracting text from multimodal content,
    eliminating repeated string comparisons throughout the codebase.
    """
    
    @staticmethod
    def get_text(content: Union[str, MultimodalContent]) -> str:
        """
        Extract text from multimodal content.
        
        Args:
            content: Either a string or list of content parts
            
        Returns:
            Extracted text content
        """
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            text_parts = [
                part.get("text", "") 
                for part in content 
                if isinstance(part, dict) and part.get("type") == ContentType.TEXT.value
            ]
            return " ".join(text_parts)
        return str(content)
    
    @staticmethod
    def has_image(content: Union[str, MultimodalContent]) -> bool:
        """
        Check if content contains image data.
        
        Args:
            content: Either a string or list of content parts
            
        Returns:
            True if content contains image, False otherwise
        """
        if isinstance(content, str):
            return False
        elif isinstance(content, list):
            return any(
                isinstance(part, dict) and part.get("type") == ContentType.IMAGE_URL.value
                for part in content
            )
        return False
    
    @staticmethod
    def get_image_urls(content: Union[str, MultimodalContent]) -> List[str]:
        """
        Extract image URLs from multimodal content.
        
        Args:
            content: Either a string or list of content parts
            
        Returns:
            List of image URLs
        """
        if isinstance(content, str):
            return []
        elif isinstance(content, list):
            urls = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == ContentType.IMAGE_URL.value:
                    image_url_dict = part.get("image_url", {})
                    if isinstance(image_url_dict, dict):
                        url = image_url_dict.get("url")
                        if url:
                            urls.append(url)
            return urls
        return []
    
    @staticmethod
    def create_text_content(text: str) -> Dict[str, str]:
        """
        Create a text content part.
        
        Args:
            text: Text content
            
        Returns:
            Text content dict
        """
        return {
            "type": ContentType.TEXT.value,
            "text": text
        }
    
    @staticmethod
    def create_image_content(image_url: str) -> Dict[str, Any]:
        """
        Create an image content part.
        
        Args:
            image_url: Image URL (base64 data URI or URL)
            
        Returns:
            Image content dict
        """
        return {
            "type": ContentType.IMAGE_URL.value,
            "image_url": {"url": image_url}
        }


@dataclass
class UserMessageContent:
    """
    Structured representation of a user message with memory sections.
    
    Replaces regex-based XML parsing with structured data.
    """
    episodic_memory: List[str]
    semantic_memory: List[str]
    user_query: str
    system_context: Optional[str] = None
    
    @classmethod
    def from_string(cls, content: str) -> "UserMessageContent":
        """
        Parse XML-formatted user message into structured object.
        
        Uses proper XML parsing with ElementTree for robustness.
        Falls back to treating entire content as user query if parsing fails.
        
        Args:
            content: XML-formatted string with <episodic_memory>, 
                    <semantic_memory>, and <user_query> tags
                    
        Returns:
            UserMessageContent instance
        """
        from xml.etree.ElementTree import fromstring, ParseError
        import logging
        
        logger = logging.getLogger(__name__)
        
        try:
            # Wrap in root element for parsing (XML requires single root)
            wrapped_content = f"<root>{content}</root>"
            root = fromstring(wrapped_content)
            
            # Extract episodic memory
            episodic_memories = []
            episodic_elem = root.find("episodic_memory")
            if episodic_elem is not None and episodic_elem.text:
                episodic_text = episodic_elem.text.strip()
                if episodic_text and episodic_text != "None":
                    # Parse list items (lines starting with "- ")
                    for line in episodic_text.split("\n"):
                        line = line.strip()
                        if line.startswith("- "):
                            episodic_memories.append(line[2:].strip())
            
            # Extract semantic memory
            semantic_memories = []
            semantic_elem = root.find("semantic_memory")
            if semantic_elem is not None and semantic_elem.text:
                semantic_text = semantic_elem.text.strip()
                if semantic_text and semantic_text != "None":
                    # Parse list items (lines starting with "- ")
                    for line in semantic_text.split("\n"):
                        line = line.strip()
                        if line.startswith("- "):
                            semantic_memories.append(line[2:].strip())
            
            # Extract user query
            user_query = ""
            query_elem = root.find("user_query")
            if query_elem is not None and query_elem.text:
                user_query = query_elem.text.strip()
            
            return cls(
                episodic_memory=episodic_memories,
                semantic_memory=semantic_memories,
                user_query=user_query
            )
        except ParseError as e:
            logger.warning(f"Failed to parse user message XML: {e}. Falling back to treating entire content as user query.")
            # Fallback: treat entire content as user query
            return cls(
                episodic_memory=[],
                semantic_memory=[],
                user_query=content.strip()
            )
        except Exception as e:
            logger.warning(f"Unexpected error parsing user message XML: {e}. Falling back to treating entire content as user query.")
            # Fallback: treat entire content as user query
            return cls(
                episodic_memory=[],
                semantic_memory=[],
                user_query=content.strip()
            )
    
    def to_string(self) -> str:
        """
        Convert structured content back to XML format.
        
        Returns:
            XML-formatted string
        """
        sections = []
        
        # Episodic memory section
        episodic_section = ["<episodic_memory>"]
        if self.episodic_memory:
            for memory in self.episodic_memory:
                episodic_section.append(f"- {memory}")
        else:
            episodic_section.append("None")
        episodic_section.append("</episodic_memory>")
        sections.append("\n".join(episodic_section))
        
        # Semantic memory section
        semantic_section = ["<semantic_memory>"]
        if self.semantic_memory:
            for memory in self.semantic_memory:
                semantic_section.append(f"- {memory}")
        else:
            semantic_section.append("None")
        semantic_section.append("</semantic_memory>")
        sections.append("\n".join(semantic_section))
        
        # User query section
        sections.append(f"<user_query>\n{self.user_query}\n</user_query>")
        
        return "\n\n".join(sections)

