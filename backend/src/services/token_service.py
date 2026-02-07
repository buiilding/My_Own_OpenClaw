"""
Token Service.

Provides token counting functionality for conversation messages using LiteLLM.
"""

import logging
from threading import Lock
from typing import Any, Dict, Iterable, Optional

import litellm

logger = logging.getLogger(__name__)


def _to_litellm_message(message: Any) -> Dict[str, Any]:
    """Normalize a message object to the dict shape expected by LiteLLM."""
    if isinstance(message, dict):
        normalized = dict(message)
        role = normalized.get("role")
        if not isinstance(role, str) or not role.strip():
            normalized["role"] = "user"
        else:
            normalized["role"] = role
        if normalized.get("content") is None:
            normalized["content"] = ""
        else:
            normalized.setdefault("content", "")
        return normalized
    role = getattr(message, "role", "user")
    content = getattr(message, "content", "")
    if not isinstance(role, str) or not role.strip():
        role = "user"
    if content is None:
        content = ""
    return {
        "role": role,
        "content": content,
    }


def _extract_text_char_count(content: Any) -> int:
    """Count text characters from plain or multimodal message content."""
    if isinstance(content, str):
        return len(content)

    if isinstance(content, dict):
        return _extract_text_char_count_from_part(content)

    if not isinstance(content, list):
        return 0

    total = 0
    for item in content:
        total += _extract_text_char_count_from_part(item)
    return total


def _extract_text_char_count_from_part(item: Any) -> int:
    """Count text characters from one multimodal content part."""
    if not isinstance(item, dict):
        return 0

    part_type = item.get("type")
    if part_type not in {"text", "input_text"}:
        return 0

    text = item.get("text", "")
    if isinstance(text, str):
        return len(text)
    return 0


def _fallback_token_estimate(messages: Iterable[Any]) -> int:
    """Estimate token count from text content when LiteLLM counting fails."""
    total_chars = 0
    for msg in messages:
        content = msg.get("content", "") if isinstance(msg, dict) else getattr(msg, "content", "")
        total_chars += _extract_text_char_count(content)
    return total_chars // 4


class TokenService:
    """
    Service for counting tokens in conversation messages.
    
    PERFORMANCE NOTE: Message list conversion happens on every call. For large
    contexts, consider caching converted message lists if the same messages
    are counted multiple times. litellm.token_counter should handle tokenizer
    caching internally, but this cannot be verified without inspecting litellm
    source code.
    """

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
        # Materialize once so we can reuse the same input in both normal and fallback paths.
        message_list = list(messages)
        if not message_list:
            return 0

        try:
            # Convert messages to the format expected by litellm.
            litellm_messages = [_to_litellm_message(msg) for msg in message_list]

            # Use litellm's token counter with image token counting enabled
            # NOTE: litellm.token_counter should cache tokenizer instances internally
            # per model, but this behavior cannot be verified without inspecting
            # litellm source code. If token counting becomes a bottleneck, consider
            # using tiktoken directly with explicit tokenizer caching.
            token_count = litellm.token_counter(
                model=model,
                messages=litellm_messages,
                use_default_image_token_count=True  # Enable image token counting
            )
            return token_count
        except Exception:
            logger.exception("Failed to count tokens via litellm; using fallback estimation")
            # Roughly 4 characters per token for English text.
            return _fallback_token_estimate(message_list)

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
_token_service: Optional[TokenService] = None
_token_service_lock = Lock()

def get_token_service() -> TokenService:
    """Get the global token service instance."""
    global _token_service
    if _token_service is None:
        with _token_service_lock:
            if _token_service is None:
                _token_service = TokenService()
    return _token_service
