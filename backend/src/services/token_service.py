"""
Token Service.

Provides token counting functionality for conversation messages using LiteLLM.
"""

import logging
from typing import List, Optional

import litellm
from backend.src.core.types import LLMMessage

logger = logging.getLogger(__name__)


class TokenService:
    """Service for counting tokens in conversation messages."""

    @staticmethod
    def count_tokens(messages, model: str = "gpt-3.5-turbo") -> int:
        """
        Count the total tokens in a list of messages, including image tokens.

        Args:
            messages: List of LLMMessage objects (can be dict or TypedDict)
            model: Model name to use for token counting

        Returns:
            Total token count including image tokens
        """
        try:
            # Convert messages to the format expected by litellm
            # Handle both dict and object formats, preserving multimodal content
            litellm_messages = []
            for msg in messages:
                if isinstance(msg, dict):
                    # Dict format - preserve as-is for multimodal support
                    litellm_messages.append(msg)
                else:
                    # Object format - convert to dict
                    litellm_messages.append({
                        "role": msg.role,
                        "content": msg.content
                    })

            # Use litellm's token counter with image token counting enabled
            token_count = litellm.token_counter(
                model=model,
                messages=litellm_messages,
                use_default_image_token_count=True  # Enable image token counting
            )
            return token_count
        except Exception as e:
            logger.error(f"Failed to count tokens: {e}")
            # Fallback: rough estimation based on character count
            # Roughly 4 characters per token for English text
            # For multimodal content, estimate based on text content only
            total_chars = 0
            for msg in messages:
                if isinstance(msg, dict):
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        # Text-only content
                        total_chars += len(content)
                    elif isinstance(content, list):
                        # Multimodal content - count text parts only
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "text":
                                total_chars += len(item.get("text", ""))
                            # Skip image content in fallback (too complex to estimate accurately)
                else:
                    content = getattr(msg, 'content', '')
                    if isinstance(content, str):
                        total_chars += len(content)
                    elif isinstance(content, list):
                        # Multimodal content
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "text":
                                total_chars += len(item.get("text", ""))

            return total_chars // 4

    @staticmethod
    def count_message_tokens(message, model: str = "gpt-3.5-turbo") -> int:
        """
        Count tokens in a single message.

        Args:
            message: Single LLMMessage object or dict
            model: Model name to use for token counting

        Returns:
            Token count for the message
        """
        return TokenService.count_tokens([message], model)


# Global instance
_token_service = None

def get_token_service() -> TokenService:
    """Get the global token service instance."""
    global _token_service
    if _token_service is None:
        _token_service = TokenService()
    return _token_service
