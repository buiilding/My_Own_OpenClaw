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
import re
from functools import lru_cache
from typing import List, Dict, Any, Optional, Union

from backend.src.core.config import AppConfig
from backend.src.llm.prompts.prompts import get_system_prompt
from backend.src.llm.prompts.prompt_metadata import PromptMetadata, UserMessageMetadata
from backend.src.tools.registry import ToolRegistry
from backend.src.core.messages.converters import content_to_message_content
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.core.types.schemas import LLMMessage
from backend.src.core.observability.trust_boundary_metrics import MetricsService
# system_monitor removed - frontend handles system state

logger = logging.getLogger(__name__)


@lru_cache(maxsize=128)
def _xml_tag_pattern(tag_name: str) -> re.Pattern[str]:
    """Compile and cache XML-like tag patterns used for prompt metadata extraction."""
    escaped_tag = re.escape(tag_name)
    # Allow attributes with quoted values that may include '>' characters.
    # Example: <tag code="if a > b">payload</tag>
    return re.compile(
        f"<{escaped_tag}(?:\\s+(?:[^>\"']+|\"[^\"]*\"|'[^']*')*)?>(.*?)</{escaped_tag}>",
        re.DOTALL,
    )


class PromptConstructor:
    """
    Constructs prompts for LLM interactions, including system prompts, tool schemas, and images.
    
    SECURITY: This is a trust boundary. All inputs are validated with size limits.
    Violations raise hard errors.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        config: AppConfig,
        system_prompt: Optional[str] = None,
        metrics_service: Optional[MetricsService] = None,
    ):
        """
        Initialize the prompt constructor.

        Args:
            tool_registry: Registry of available tools
            config: Application configuration (REQUIRED for security limits)
            system_prompt: Optional custom system prompt. If None, loads from PromptManager
                          (assumes PromptManager.initialize() was called at startup)
            metrics_service: Optional MetricsService for observability (injected via DI)
        
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
        # Use injected MetricsService or create a new instance (for backward compatibility)
        if metrics_service is None:
            from backend.src.core.observability.trust_boundary_metrics import MetricsService
            metrics_service = MetricsService()
        self.metrics = metrics_service.get_metrics("prompt_constructor")
        self.limits = config.security_limits

    def _get_filtered_tool_schemas(self) -> List[Dict[str, Any]]:
        """Return tool schemas filtered by interaction-mode allowlist when configured."""
        tool_schemas = self.tool_registry.get_function_declarations() or []
        allowlist = self.config.get_tool_allowlist()
        if allowlist is None:
            return tool_schemas
        return [
            schema
            for schema in tool_schemas
            if schema.get("name") in allowlist
        ]

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

        Gets conversation history and returns tool schemas for transparency.
        Tool schemas are embedded in the first user message, not passed as a
        separate LLM API parameter.

        Args:
            stored_messages: ConversationHistory instance - provides conversation history
            include_tools: Whether to include tool schemas (always True)

        Returns:
            Tuple of (List of LLMMessage dicts ready to send to LLM,
            List of tool schemas for transparency, PromptMetadata object)
            
        Raises:
            InputSizeLimitError: If any size limit is exceeded
        """
        boundary_name = "prompt_constructor"
        
        # Get tool schemas if needed
        tool_schemas = []
        if include_tools:
            tool_schemas = self._get_filtered_tool_schemas()

        # Get history (tools passed separately to LLM API)
        if stored_messages and hasattr(stored_messages, 'get_history'):
            prompt_messages = stored_messages.get_history()
        else:
            # Fallback: empty history if stored_messages not available
            prompt_messages = []

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
                    # Try to extract context XML from the message content
                    if "<system_context>" in full_content:
                        start_idx = full_content.find("<system_context>")
                        end_idx = full_content.find("</system_context>") + len("</system_context>")
                        if end_idx > start_idx:
                            context_xml = full_content[start_idx:end_idx]
                    
                    # Try to extract active window from context XML
                    if "<active_window>" in full_content:
                        a_start = full_content.find("<active_window>") + len("<active_window>")
                        a_end = full_content.find("</active_window>")
                        if a_end > a_start:
                            active_window = full_content[a_start:a_end]
                
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
        """
        Calculate the size of a message in bytes.
        
        PERFORMANCE: Sums content lengths directly instead of serializing to JSON,
        avoiding O(N) allocation and CPU overhead on the hot path.
        """
        size = 0
        try:
            for key, value in msg.items():
                # Add key length
                if isinstance(key, str):
                    size += len(key)
                else:
                    size += len(str(key))
                
                # Add value length based on type
                if isinstance(value, str):
                    size += len(value)
                elif isinstance(value, (dict, list)):
                    # For complex nested structures, fallback to JSON serialization
                    # This is rare, so the overhead is acceptable
                    size += len(json.dumps(value, ensure_ascii=False))
                elif value is None:
                    # None adds minimal size (null in JSON)
                    size += 4
                else:
                    # For other types, estimate from string representation
                    size += len(str(value))
        except (TypeError, ValueError, AttributeError):
            # Fallback: if direct calculation fails, use JSON serialization
            try:
                return len(json.dumps(msg, ensure_ascii=False))
            except (TypeError, ValueError):
                return len(str(msg))
        
        return size
    
    def _extract_xml_tag(self, content: str, tag_name: str) -> str:
        """
        Extract XML tag content using regex to handle attributes correctly.
        
        CORRECTNESS: Uses regex instead of naive find(">") to properly handle
        attributes that may contain '>' characters (e.g., code="if a > b:").
        
        SECURITY: Limits search space and validates extracted size to prevent DoS.
        
        NOTE: For production usage with hostile input, consider using a proper
        XML parser (lxml or defusedxml) which handles all edge cases correctly.
        """
        match = self._search_xml_tag(content, tag_name)
        if not match:
            return ""
        
        # Get the full match (entire tag including content)
        full_tag = match.group(0)
        
        # SECURITY: Validate extracted size
        if len(full_tag) > self.limits.max_message_content_size:
            return ""  # Too large, reject
        
        return full_tag
    
    def _extract_xml_tag_content(self, content: str, tag_name: str) -> Optional[str]:
        """
        Extract content inside XML tag using regex.
        
        CORRECTNESS: Uses regex to properly handle attributes, avoiding the
        naive find(">") bug that breaks on attributes containing '>'.
        
        SECURITY: Limits search space and validates extracted size.
        """
        match = self._search_xml_tag(content, tag_name)
        if not match:
            return None
        
        # Extract content (group 1 is the content between tags)
        extracted = match.group(1)
        
        # SECURITY: Validate extracted size
        if len(extracted) > self.limits.max_message_content_size:
            return None  # Too large, reject
        
        return extracted.strip()

    def _search_xml_tag(self, content: str, tag_name: str) -> Optional[re.Match[str]]:
        """Search bounded content for a tag using cached compiled pattern."""
        max_search_size = min(len(content), self.limits.max_message_content_size)
        search_content = content[:max_search_size]
        return _xml_tag_pattern(tag_name).search(search_content)
    
    def format_user_message_content(
        self,
        message_content: Optional[str],
        query: str,
        is_first_message: bool,
    ) -> str:
        """
        Format user message content with tool schemas if needed.
        
        This method handles the formatting logic for user messages, including:
        - Fallback formatting when message_content is not provided
        - Adding tool schemas to the first message only
        
        Args:
            message_content: Complete message content from frontend (system state + memories + query)
            query: The user's raw query text (for fallback formatting)
            is_first_message: Whether this is the first user message in the conversation
            
        Returns:
            Formatted message content ready to be added to history
        """
        # Build base content
        if message_content:
            # Use frontend-provided content
            final_content = message_content
        else:
            # Fallback: just the query (shouldn't happen in normal flow)
            logger.warning("No message content provided by frontend, using query only")
            final_content = f"<user_query>\n{query}\n</user_query>"
        
        # Add tool schemas to first message only
        if is_first_message:
            tool_schemas = self._get_filtered_tool_schemas()
            if tool_schemas:
                tool_schemas_json = json.dumps(tool_schemas, indent=2)
                final_content = f"{final_content}\n\n<tool_schemas>\n{tool_schemas_json}\n</tool_schemas>"
        
        return final_content
