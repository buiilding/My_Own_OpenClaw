"""
Token Service.

Provides token counting functionality for conversation messages using LiteLLM.
"""

import json
import logging
from threading import Lock
from typing import Any, Dict, Iterable, Optional

import litellm

logger = logging.getLogger(__name__)

_MODEL_MAX_INPUT_TOKEN_OVERRIDES = {
    "k2p5": 262144,
    "kimi-coding/k2p5": 262144,
}


def _normalize_role(value: Any) -> str:
    """Normalize role values to non-empty stripped strings."""
    if not isinstance(value, str):
        return "user"
    role = value.strip()
    return role or "user"


def _to_litellm_message(message: Any) -> Dict[str, Any]:
    """Normalize a message object to the dict shape expected by LiteLLM."""
    if isinstance(message, dict):
        normalized = dict(message)
        normalized["role"] = _normalize_role(normalized.get("role"))
        if normalized.get("content") is None:
            normalized["content"] = ""
        else:
            normalized.setdefault("content", "")
        if normalized["role"] == "assistant" and "tool_calls" in normalized:
            normalized_tool_calls = _normalize_assistant_tool_calls(
                normalized.get("tool_calls")
            )
            if normalized_tool_calls:
                normalized["tool_calls"] = normalized_tool_calls
            else:
                normalized.pop("tool_calls", None)
        return normalized
    role = _normalize_role(getattr(message, "role", "user"))
    content = getattr(message, "content", "")
    if content is None:
        content = ""
    normalized_message = {
        "role": role,
        "content": content,
    }
    if role == "assistant":
        normalized_tool_calls = _normalize_assistant_tool_calls(
            getattr(message, "tool_calls", None)
        )
        if normalized_tool_calls:
            normalized_message["tool_calls"] = normalized_tool_calls
    return normalized_message


def _serialize_tool_arguments(value: Any) -> str:
    """Serialize tool-call arguments to compact JSON string form."""
    if isinstance(value, str):
        return value
    if value is None:
        return "{}"
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return "{}"


def _normalize_assistant_tool_calls(tool_calls: Any) -> Optional[list[Dict[str, Any]]]:
    """
    Normalize assistant tool_calls to OpenAI/LiteLLM shape.

    Supports both canonical OpenAI shape and internal runtime shape.
    """
    if tool_calls is None:
        return None
    if not isinstance(tool_calls, list):
        return None

    normalized_calls: list[Dict[str, Any]] = []
    for index, raw_call in enumerate(tool_calls):
        if not isinstance(raw_call, dict):
            continue

        # Canonical shape: {"id", "type":"function", "function": {"name", "arguments"}}
        if raw_call.get("type") == "function" and isinstance(raw_call.get("function"), dict):
            function_block = dict(raw_call["function"])
            function_name = function_block.get("name")
            if not isinstance(function_name, str) or not function_name.strip():
                continue
            function_block["name"] = function_name
            function_block["arguments"] = _serialize_tool_arguments(
                function_block.get("arguments")
            )
            normalized_call = dict(raw_call)
            normalized_call["type"] = "function"
            normalized_call["function"] = function_block
            normalized_calls.append(normalized_call)
            continue

        # Internal shape: {"id", "name", "arguments"}
        function_name = raw_call.get("name")
        if not isinstance(function_name, str) or not function_name.strip():
            continue
        tool_call_id = raw_call.get("id")
        if not isinstance(tool_call_id, str) or not tool_call_id.strip():
            tool_call_id = f"tool_call_{index}"
        normalized_calls.append(
            {
                "id": tool_call_id,
                "type": "function",
                "function": {
                    "name": function_name,
                    "arguments": _serialize_tool_arguments(raw_call.get("arguments", {})),
                },
            }
        )

    return normalized_calls


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
        if isinstance(item, str):
            total += len(item)
            continue
        total += _extract_text_char_count_from_part(item)
    return total


def _extract_text_char_count_from_part(item: Any) -> int:
    """Count text characters from one multimodal content part."""
    if not isinstance(item, dict):
        return 0

    part_type = item.get("type")
    if part_type not in {"text", "input_text"}:
        return 0

    text = item.get("text")
    if isinstance(text, str):
        return len(text)

    # Some adapters use "content" for text payload in text parts.
    content = item.get("content")
    if isinstance(content, str):
        return len(content)
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

    @staticmethod
    def get_model_max_input_tokens(model: str) -> Optional[int]:
        """
        Resolve model max input context tokens from LiteLLM model metadata.

        Args:
            model: Canonical model identifier (for example `openai/gpt-5.1`)

        Returns:
            Maximum input context length if available, otherwise None.
        """
        if not isinstance(model, str) or not model.strip():
            return None
        normalized_model = model.strip().lower()
        override = _MODEL_MAX_INPUT_TOKEN_OVERRIDES.get(normalized_model)
        if isinstance(override, int) and override > 0:
            return override
        try:
            info = litellm.get_model_info(model=model)
        except Exception:
            return None

        max_input_tokens = None
        if isinstance(info, dict):
            max_input_tokens = info.get("max_input_tokens")
        else:
            max_input_tokens = getattr(info, "max_input_tokens", None)

        if isinstance(max_input_tokens, int) and max_input_tokens > 0:
            return max_input_tokens
        return None


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
