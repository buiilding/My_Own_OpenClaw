"""
Prompt Metadata for LLM interactions.

This module provides structured metadata about prompts constructed for LLM interactions,
replacing dictionary-based metadata with type-safe dataclasses.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from backend.src.core.types.schemas import LLMMessage


@dataclass
class UserMessageMetadata:
    """Metadata about a user message including injected context."""

    original_query: str
    full_content: str
    context_type: str  # "initial" or "sequential"
    injected_context: str
    active_window: Optional[str] = None


@dataclass
class PromptMetadata:
    """Structured metadata about a constructed prompt."""

    system_prompt: str
    tool_schemas: Optional[List[Dict[str, Any]]] = None
    client_prompt_layers: Optional[List[Dict[str, Any]]] = None
    client_prompt_layer_summary: Optional[Dict[str, Any]] = None
    user_message_metadata: Optional[UserMessageMetadata] = None


@dataclass
class ProviderPrompt:
    """Provider-bound prompt payload before model invocation."""

    messages: List[LLMMessage]
    tool_schemas: List[Dict[str, Any]]
    metadata: PromptMetadata
