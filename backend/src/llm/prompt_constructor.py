"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

SECURITY: This module is a TRUST BOUNDARY.
- All inputs are treated as HOSTILE/UNTRUSTED
- Size limits are enforced on message history and content
- Security violations raise hard errors (no soft fallbacks)
- Failures propagate immediately to prevent silent bypasses
- All violations are tracked via observability hooks for abuse detection

Trust Boundary: Message History → LLM Prompt

OBSERVABILITY: All violations are logged with structured metrics:
- Size limit violations (actual_size, max_size, ratio)
- History size violations
- Content size violations

This module handles the construction of prompts using structured Prompt objects,
eliminating circular parsing patterns and preserving data integrity.
"""
import json
import logging
from typing import List, Dict, Any, Optional, Union, TYPE_CHECKING

from backend.src.llm.prompts import get_system_prompt
from backend.src.llm.prompt_metadata import PromptMetadata, UserMessageMetadata
from backend.src.tools.registry import ToolRegistry
from backend.src.core.messages import (
    MessageRole,
    MessageType,
    StoredMessage,
    content_to_message_content,
)
from backend.src.core.types import LLMMessage
from backend.src.core.exceptions import InputSizeLimitError
from backend.src.core.observability.trust_boundary_metrics import get_metrics

if TYPE_CHECKING:
    from backend.src.core.config import AppConfig

# system_monitor removed - frontend handles system state

logger = logging.getLogger(__name__)


class PromptConstructor:
    """
    Constructs prompts for LLM interactions, including system prompts, tool schemas, and images.
    
    SECURITY: This is a trust boundary. All inputs are validated with size limits.
    Violations raise hard errors.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        config: "AppConfig",
        system_prompt: Optional[str] = None,
    ):
        """
        Initialize the prompt constructor.

        Args:
            tool_registry: Registry of available tools
            config: Application configuration (REQUIRED for security limits)
            system_prompt: Optional custom system prompt. If None, loads from PromptManager
                          (assumes PromptManager.initialize() was called at startup)
        
        Raises:
            ValueError: If config is None (security requirement)
        """
        if config is None:
            raise ValueError(
                "config is required for PromptConstructor. "
                "Cannot enforce security limits without configuration (security requirement)."
            )
        
        self.tool_registry = tool_registry
        self.config = config
        # Load system prompt at runtime (not import time) to avoid crashes
        self.system_prompt = system_prompt or get_system_prompt()
        self.metrics = get_metrics("prompt_constructor")
        self.limits = config.security_limits

    def build_prompt(
        self,
        stored_messages: Optional[Union[List[StoredMessage], Any]] = None,
        include_tools: bool = True,
    ) -> tuple[List[LLMMessage], List[Dict[str, Any]], PromptMetadata]:
        """
        Constructs the full prompt from stored history.

        SECURITY: This is a trust boundary. All inputs are validated with:
        - History size limits (max_message_history_size)
        - Message content size limits (max_message_content_size)
        - Total prompt size limits (max_prompt_size)

        Gets conversation history and returns tool schemas as separate parameters
        for the LLM API call (tools parameter and messages parameter).

        Args:
            stored_messages: ConversationHistory instance - provides conversation history
            include_tools: Whether to include tool schemas (always True)

        Returns:
            Tuple of (List of LLMMessage dicts ready to send to LLM, List of tool schemas for LLM API, PromptMetadata object)
            
        Raises:
            InputSizeLimitError: If any size limit is exceeded
        """
        boundary_name = "prompt_constructor"
        
        # Get tool schemas if needed
        tool_schemas = []
        if include_tools:
            tool_schemas = self.tool_registry.get_function_declarations() or []

        # Get history (tools passed separately to LLM API)
        if stored_messages and hasattr(stored_messages, 'get_history'):
            prompt_messages = stored_messages.get_history()
        else:
            # Fallback: empty history if stored_messages not available
            if stored_messages is not None:
                logger.warning(
                    f"stored_messages provided but missing 'get_history' method. "
                    f"Type: {type(stored_messages).__name__}. Using empty history."
                )
            prompt_messages = []
        
        # SECURITY: Check history size limit
        if len(prompt_messages) > self.limits.max_message_history_size:
            self.metrics.record_size_violation(
                actual_size=len(prompt_messages),
                max_size=self.limits.max_message_history_size,
                boundary_name=boundary_name,
                metadata={"check": "message_history_size"},
            )
            raise InputSizeLimitError(
                f"Message history size {len(prompt_messages)} exceeds maximum {self.limits.max_message_history_size}",
                actual_size=len(prompt_messages),
                max_size=self.limits.max_message_history_size,
                boundary_name=boundary_name,
            )
        
        # SECURITY: Check individual message content sizes and calculate total
        total_prompt_size = len(self.system_prompt)
        for msg in prompt_messages:
            # Calculate message size
            msg_size = self._calculate_message_size(msg)
            if msg_size > self.limits.max_message_content_size:
                self.metrics.record_size_violation(
                    actual_size=msg_size,
                    max_size=self.limits.max_message_content_size,
                    boundary_name=boundary_name,
                    metadata={"check": "message_content_size"},
                )
                raise InputSizeLimitError(
                    f"Message content size {msg_size} exceeds maximum {self.limits.max_message_content_size}",
                    actual_size=msg_size,
                    max_size=self.limits.max_message_content_size,
                    boundary_name=boundary_name,
                )
            total_prompt_size += msg_size
        
        # SECURITY: Check total prompt size
        if total_prompt_size > self.limits.max_prompt_size:
            self.metrics.record_size_violation(
                actual_size=total_prompt_size,
                max_size=self.limits.max_prompt_size,
                boundary_name=boundary_name,
                metadata={"check": "total_prompt_size"},
            )
            raise InputSizeLimitError(
                f"Total prompt size {total_prompt_size} exceeds maximum {self.limits.max_prompt_size}",
                actual_size=total_prompt_size,
                max_size=self.limits.max_prompt_size,
                boundary_name=boundary_name,
            )

        # Build metadata for transparency events
        user_message_metadata = None

        if stored_messages and hasattr(stored_messages, 'last_user_query'):
            last_user_query_stored = stored_messages.last_user_query
            if last_user_query_stored:
                # Extract metadata from stored message
                user_query = last_user_query_stored.user_query_raw or ""

                # Find the last user message in rendered history for full content
                full_content = ""
                for msg in reversed(prompt_messages):
                    if msg["role"] == MessageRole.USER.value:
                        msg_content = content_to_message_content(msg["content"])
                        text_content = msg_content.get_text()
                        if "<user_query>" in text_content:
                            full_content = text_content
                            break

                # Determine context type and extract context XML from content
                stored_list = stored_messages.get_stored_messages()
                user_query_count = sum(1 for msg in stored_list if msg.message_type == MessageType.USER_QUERY)
                is_first_user_message = (user_query_count == 1)

                # Extract context XML from message content
                context_xml = ""
                active_window = "Unknown"
                if full_content:
                    # SECURITY: Use proper XML extraction with size limits
                    context_xml = self._extract_xml_tag(full_content, "system_context")
                    
                    # Extract active window from context XML or full content
                    if context_xml:
                        active_window = self._extract_xml_tag_content(context_xml, "active_window") or "Unknown"
                    else:
                        active_window = self._extract_xml_tag_content(full_content, "active_window") or "Unknown"
                
                user_message_metadata = UserMessageMetadata(
                    original_query=user_query,
                    full_content=full_content,
                    context_type="initial" if is_first_user_message else "sequential",
                    injected_context=context_xml,
                    active_window=active_window,
                )

        metadata = PromptMetadata(
            system_prompt=self.system_prompt,
            tool_schemas=tool_schemas,
            user_message_metadata=user_message_metadata,
        )

        return prompt_messages, tool_schemas, metadata
    
    def _calculate_message_size(self, msg: Dict[str, Any]) -> int:
        """Calculate the size of a message in bytes."""
        try:
            # Serialize message to JSON to get accurate size
            return len(json.dumps(msg, ensure_ascii=False))
        except (TypeError, ValueError):
            # Fallback: estimate size from string representation
            return len(str(msg))
    
    def _extract_xml_tag(self, content: str, tag_name: str) -> str:
        """
        Extract XML tag content with size limits.
        
        SECURITY: Uses efficient string operations with size limits to prevent DoS.
        More efficient than regex for large inputs while maintaining security.
        """
        # SECURITY: Limit search to reasonable size
        max_search_size = min(len(content), self.limits.max_message_content_size)
        search_content = content[:max_search_size]
        
        # Find opening tag
        open_tag = f"<{tag_name}"
        open_pos = search_content.find(open_tag)
        if open_pos == -1:
            return ""
        
        # Find closing bracket of opening tag
        open_tag_end = search_content.find(">", open_pos)
        if open_tag_end == -1:
            return ""
        
        # Find closing tag (search from after opening tag)
        close_tag = f"</{tag_name}>"
        close_pos = search_content.find(close_tag, open_tag_end + 1)
        if close_pos == -1:
            return ""
        
        # Extract full tag including content
        extracted = search_content[open_pos:close_pos + len(close_tag)]
        
        # SECURITY: Validate extracted size
        if len(extracted) > self.limits.max_message_content_size:
            return ""  # Too large, reject
        
        return extracted
    
    def _extract_xml_tag_content(self, content: str, tag_name: str) -> Optional[str]:
        """
        Extract content inside XML tag.
        
        SECURITY: Uses efficient string operations with size limits.
        More efficient than regex for large inputs while maintaining security.
        """
        # SECURITY: Limit search to reasonable size
        max_search_size = min(len(content), self.limits.max_message_content_size)
        search_content = content[:max_search_size]
        
        # Find opening tag
        open_tag = f"<{tag_name}"
        open_pos = search_content.find(open_tag)
        if open_pos == -1:
            return None
        
        # Find closing bracket of opening tag
        open_tag_end = search_content.find(">", open_pos)
        if open_tag_end == -1:
            return None
        
        # Find closing tag (search from after opening tag)
        close_tag = f"</{tag_name}>"
        close_pos = search_content.find(close_tag, open_tag_end + 1)
        if close_pos == -1:
            return None
        
        # Extract content between tags
        extracted = search_content[open_tag_end + 1:close_pos]
        
        # SECURITY: Validate extracted size
        if len(extracted) > self.limits.max_message_content_size:
            return None  # Too large, reject
        
        return extracted.strip()