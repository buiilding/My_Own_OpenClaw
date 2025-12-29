"""
Prompt Metadata for LLM interactions.

This module provides structured metadata about prompts constructed for LLM interactions,
replacing dictionary-based metadata with type-safe dataclasses.
"""
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class UserMessageMetadata:
    """Metadata about a user message including injected context."""
    original_query: str
    full_content: str
    context_type: str  # "initial" or "full"
    injected_context: str
    active_window: Optional[str] = None


@dataclass
class PromptMetadata:
    """Structured metadata about a constructed prompt."""
    system_prompt: str
    tool_schemas: Optional[Dict[str, Any]] = None
    user_message_metadata: Optional[UserMessageMetadata] = None

