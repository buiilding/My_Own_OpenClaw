"""
Token Service.

Provides token counting functionality for conversation messages using LiteLLM.
"""

import json
import logging
from threading import Lock
from typing import Any, Dict, Iterable, Optional

import litellm

from backend.src.core.messages.content_blocks import extract_text_from_content_part
from backend.src.core.messages.tool_call_thought_signature import (
    apply_tool_call_thought_signature,
    extract_tool_call_thought_signature,
)
from backend.src.llm.models.models_config import (
    get_model_catalog_metadata,
    resolve_runtime_model_id,
)
from backend.src.tools.tool_specs import is_function_tool_spec, to_litellm_function_tool

logger = logging.getLogger(__name__)

_MODEL_MAX_INPUT_TOKEN_OVERRIDES = {
    "k2p5": 262144,
    "kimi-coding/k2p5": 262144,
}

_MODEL_NAME_ALIASES_FOR_LITELLM = {
    "k2p5": "kimi-coding/k2p5",
}


def _normalize_role(value: Any) -> str:
    """Normalize role values to non-empty stripped strings."""
    if not isinstance(value, str):
        return "user"
    role = value.strip()
    return role or "user"


def _normalize_model_for_litellm(model: Any) -> str:
    """Map internal model ids to LiteLLM-preferred provider-qualified model ids."""
    if not isinstance(model, str):
        return "gpt-3.5-turbo"
    model_name = model.strip()
    if not model_name:
        return "gpt-3.5-turbo"
    return _MODEL_NAME_ALIASES_FOR_LITELLM.get(model_name.lower(), model_name)


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
        if raw_call.get("type") == "function" and isinstance(
            raw_call.get("function"), dict
        ):
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
            apply_tool_call_thought_signature(
                normalized_call=normalized_call,
                thought_signature=extract_tool_call_thought_signature(
                    raw_call,
                    function_block,
                ),
            )
            normalized_calls.append(normalized_call)
            continue

        # Internal shape: {"id", "name", "arguments"}
        function_name = raw_call.get("name")
        if not isinstance(function_name, str) or not function_name.strip():
            continue
        tool_call_id = raw_call.get("id")
        if not isinstance(tool_call_id, str) or not tool_call_id.strip():
            tool_call_id = f"tool_call_{index}"
        normalized_call = {
            "id": tool_call_id,
            "type": "function",
            "function": {
                "name": function_name,
                "arguments": _serialize_tool_arguments(raw_call.get("arguments", {})),
            },
        }
        apply_tool_call_thought_signature(
            normalized_call=normalized_call,
            thought_signature=extract_tool_call_thought_signature(raw_call),
        )
        normalized_calls.append(normalized_call)

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
    text = extract_text_from_content_part(item, include_refusal=True)
    return len(text) if text else 0


def _fallback_token_estimate(messages: Iterable[Any]) -> int:
    """Estimate token count from text content when LiteLLM counting fails."""
    total_chars = 0
    for msg in messages:
        content = (
            msg.get("content", "")
            if isinstance(msg, dict)
            else getattr(msg, "content", "")
        )
        total_chars += _extract_text_char_count(content)
    return total_chars // 4


def _fallback_tool_token_estimate(
    tools: Optional[Iterable[Any]],
    tool_choice: Any = None,
) -> int:
    """Estimate provider tool-schema tokens when tokenizer support is unavailable."""
    if tools is None and tool_choice is None:
        return 0
    payload: Dict[str, Any] = {}
    if tools is not None:
        payload["tools"] = list(tools)
    if tool_choice is not None:
        payload["tool_choice"] = tool_choice
    try:
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        serialized = str(payload)
    return len(serialized) // 4


def _normalize_tools_for_litellm_token_counter(
    tools: Optional[Iterable[Any]],
) -> Optional[list[Dict[str, Any]]]:
    """Normalize flat agent tool specs to LiteLLM/OpenAI tool shape."""
    if tools is None:
        return None
    normalized: list[Dict[str, Any]] = []
    for tool in tools:
        if is_function_tool_spec(tool):
            normalized.append(to_litellm_function_tool(tool))
            continue
        if isinstance(tool, dict):
            normalized.append(dict(tool))
            continue
        normalized.append({"type": "function", "function": {"name": str(tool)}})
    return normalized


def _fallback_truncate_text(
    text: str,
    *,
    token_limit: int,
    marker: str,
) -> tuple[str, int, bool, str]:
    original_tokens = max(1, (len(text) + 3) // 4) if text else 0
    if original_tokens <= token_limit:
        return text, original_tokens, False, "estimate"

    char_limit = max(token_limit * 4, 1)
    if len(marker) >= char_limit:
        return text[:char_limit], original_tokens, True, "estimate"

    available = char_limit - len(marker)
    head = max(available // 2, 0)
    tail = max(available - head, 0)
    tail_text = text[-tail:] if tail else ""
    return f"{text[:head]}{marker}{tail_text}", original_tokens, True, "estimate"


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
    def count_tokens(
        messages,
        model: str = "gpt-3.5-turbo",
        *,
        tools: Optional[Iterable[Any]] = None,
        tool_choice: Any = None,
    ) -> int:
        """
        Count the total tokens in a list of messages, including image tokens.

        Args:
            messages: List of LLMMessage objects (can be dict or TypedDict)
            model: Model name to use for token counting
            tools: Optional provider-bound tool schemas to include in the count
            tool_choice: Optional provider-bound tool-choice payload

        Returns:
            Total token count including image tokens and tool schemas
        """
        # Materialize once so we can reuse the same input in both normal and fallback paths.
        message_list = list(messages)
        if not message_list and tools is None and tool_choice is None:
            return 0

        try:
            normalized_model = _normalize_model_for_litellm(
                resolve_runtime_model_id(model)
            )
            # Convert messages to the format expected by litellm.
            litellm_messages = [_to_litellm_message(msg) for msg in message_list]

            # Use litellm's token counter with image token counting enabled
            # NOTE: litellm.token_counter should cache tokenizer instances internally
            # per model, but this behavior cannot be verified without inspecting
            # litellm source code. If token counting becomes a bottleneck, consider
            # using tiktoken directly with explicit tokenizer caching.
            token_count = litellm.token_counter(
                model=normalized_model,
                messages=litellm_messages,
                tools=_normalize_tools_for_litellm_token_counter(tools),
                tool_choice=tool_choice,
                use_default_image_token_count=True,  # Enable image token counting
            )
            return token_count
        except Exception:
            logger.exception(
                "Failed to count tokens via litellm; using fallback estimation"
            )
            # Roughly 4 characters per token for English text.
            return _fallback_token_estimate(
                message_list
            ) + _fallback_tool_token_estimate(
                tools,
                tool_choice,
            )

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
    def truncate_text(
        text: str,
        *,
        model: str,
        token_limit: int,
        marker: str,
    ) -> tuple[str, int, bool, str]:
        """
        Truncate text using LiteLLM's model tokenizer when available.

        Returns:
            Tuple of (text, original_tokens, truncated, token_source).
        """
        if token_limit <= 0:
            token_limit = 1
        try:
            normalized_model = _normalize_model_for_litellm(
                resolve_runtime_model_id(model)
            )
            tokens = litellm.encode(model=normalized_model, text=text)
            original_tokens = len(tokens)
            if original_tokens <= token_limit:
                return text, original_tokens, False, "litellm"

            marker_tokens = litellm.encode(model=normalized_model, text=marker)
            if len(marker_tokens) >= token_limit:
                truncated_tokens = tokens[:token_limit]
                return (
                    litellm.decode(model=normalized_model, tokens=truncated_tokens),
                    original_tokens,
                    True,
                    "litellm",
                )

            available = token_limit - len(marker_tokens)
            head = max(available // 2, 0)
            tail = max(available - head, 0)
            tail_tokens = tokens[-tail:] if tail else []
            truncated_tokens = tokens[:head] + marker_tokens + tail_tokens
            return (
                litellm.decode(model=normalized_model, tokens=truncated_tokens),
                original_tokens,
                True,
                "litellm",
            )
        except Exception as exc:
            logger.warning(
                "Failed to truncate text via litellm; using fallback estimation: %s",
                exc,
            )
            return _fallback_truncate_text(
                text,
                token_limit=token_limit,
                marker=marker,
            )

    @staticmethod
    def get_model_max_input_tokens(model: str) -> Optional[int]:
        """
        Resolve model max input context tokens from catalog metadata,
        then fallback to LiteLLM model metadata.

        Args:
            model: Canonical model identifier (for example `openai/gpt-5.4`)

        Returns:
            Maximum input context length if available, otherwise None.
        """
        if not isinstance(model, str) or not model.strip():
            return None
        model_name = model.strip()
        normalized_model = model_name.lower()
        override = _MODEL_MAX_INPUT_TOKEN_OVERRIDES.get(normalized_model)
        if isinstance(override, int) and override > 0:
            return override

        provider_name = ""
        if "/" in model_name:
            provider_name, _ = model_name.split("/", 1)
        runtime_model_id = resolve_runtime_model_id(model_name)
        catalog_metadata = get_model_catalog_metadata(provider_name, runtime_model_id)
        catalog_context_window = catalog_metadata.get("context_window")
        if isinstance(catalog_context_window, int) and catalog_context_window > 0:
            return catalog_context_window

        normalized_litellm_model = _normalize_model_for_litellm(runtime_model_id)
        try:
            info = litellm.get_model_info(model=normalized_litellm_model)
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
