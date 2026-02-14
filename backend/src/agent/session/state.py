"""
Conversation History Manager for maintaining conversation state.

This module manages the conversation history, including pruning to prevent
context window overflow.
"""

import copy
import logging
from typing import Any, Dict, List, Optional

from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.core.types.schemas import LLMMessage

logger = logging.getLogger(__name__)


class ConversationHistory:
    """
    Manages conversation history with automatic pruning.
    
    History stores messages in structured StoredMessage format for type safety.
    Maintains a cached LLMMessage format for O(1) retrieval instead of O(n) conversion.
    """

    def __init__(self, max_length: Optional[int] = 10, system_prompt: Optional[str] = None):
        """
        Initialize the conversation history.

        Args:
            max_length: Maximum number of messages to keep in history
            system_prompt: System prompt to store and include in history
        """
        # Internal format: List of StoredMessage instances
        self.history: List[StoredMessage] = []
        # Cached LLM format for O(1) retrieval (updated incrementally)
        self._llm_history_cache: List[LLMMessage] = []
        self.max_length = max_length
        self.system_prompt: Optional[str] = system_prompt
        self._image_trimming_enabled = True
        self._pending_tool_call_ids: List[str] = []
        self._consume_all_tool_call_ids_on_next_output = False
        
        # Running token count to avoid O(N^2) re-encoding on every turn
        # Updated incrementally when messages are added
        self._cached_token_count: Optional[int] = None
        self._cached_token_count_model: Optional[str] = None  # Model ID for which count is cached

        # If max_length is None, disable pruning
        if self.max_length is None:
            self.max_length = float('inf')

    def add_user_message(
        self,
        content: str,
        image_data: Optional[str] = None,
        episodic_memory: Optional[List[str]] = None,
        semantic_memory: Optional[List[str]] = None,
        user_query_raw: Optional[str] = None,
    ) -> None:
        """
        Add an actual user message to the conversation history.
        Content includes context XML, memory sections, and user query.

        MEMORY DOS PROTECTION: Only the two most recent images are kept. When a new screenshot
        arrives, the LLM compares previous state vs current state to verify actions; older
        images add no value to that comparison. Text content is preserved for context.

        Args:
            content: Message content (context + memory + query)
            image_data: Optional base64 image data (cleared except for the 2 most recent images to limit memory DoS)
            episodic_memory: Optional list of episodic memory strings (structured data)
            semantic_memory: Optional list of semantic memory strings (structured data)
            user_query_raw: Optional raw user query text (structured data)
        """
        stored_msg = self._build_user_message(
            content=content,
            image_data=image_data,
            episodic_memory=episodic_memory,
            semantic_memory=semantic_memory,
            user_query_raw=user_query_raw,
        )
        self._append_message(stored_msg)
        # Invalidate token count cache (new message added)
        self._invalidate_token_cache()
        self._prune_if_needed()
        self._maybe_trim_old_images()

    def add_tool_output(self, message: str, image_data: Optional[str] = None) -> None:
        """
        Add a tool execution result to the conversation history.
        These messages do NOT trigger memory retrieval.
        
        Tool outputs are stored with their screenshots (if available) and included
        in conversation history. Screenshots are automatically converted to multimodal
        format when history is retrieved for LLM consumption.
        
        Note: The message must include os_state XML with active_window, mouse_position, and time.
        Frontend pre-formats messages with system context XML embedded in llm_content.
        ResultTransformer passes pre-formatted messages through.

        Args:
            message: Tool output message text (pre-formatted by frontend with os_state XML)
            image_data: Optional base64 image data (for screenshots). Automatically captured
                       by the frontend after tool execution. Included in history
                       and sent to LLM as multimodal content.
        """
        tool_call_ids = self._consume_tool_call_ids_for_next_output()
        stored_messages: List[StoredMessage] = []
        if tool_call_ids:
            for tool_call_id in tool_call_ids:
                stored_messages.append(
                    self._build_tool_result_message(
                        message=message,
                        tool_call_id=tool_call_id,
                    )
                )

        # Keep legacy user-role multimodal message for screenshot continuity.
        stored_messages.append(self._build_tool_output_message(message, image_data))

        # INCREMENTAL TOKEN COUNT: If cache is valid, count new message before pruning
        # This avoids O(N) re-counting when multiple tools are called in sequence
        new_message_token_count = 0
        cache_was_valid = (
            self._cached_token_count is not None 
            and self._cached_token_count_model is not None
        )

        llm_messages = [stored_msg.to_llm_message() for stored_msg in stored_messages]

        if cache_was_valid:
            # Count tokens for the new message only (O(1) operation)
            from backend.src.services.token_service import get_token_service
            token_service = get_token_service()
            for llm_msg in llm_messages:
                new_message_token_count += token_service.count_message_tokens(
                    llm_msg,
                    self._cached_token_count_model,
                )
        
        # Store history length before pruning to detect if pruning occurred
        history_length_before = len(self.history)

        for stored_msg, llm_msg in zip(stored_messages, llm_messages):
            self._append_message(stored_msg, llm_msg)
        
        # Prune if needed (this may invalidate cache if pruning occurs)
        self._prune_if_needed()
        
        # INCREMENTAL UPDATE: If cache was valid and no pruning occurred, update incrementally
        # If pruning occurred, _prune_if_needed already invalidated the cache
        history_length_after = len(self.history)
        if (
            cache_was_valid 
            and history_length_before + len(stored_messages) == history_length_after
        ):
            # Incrementally update cache instead of invalidating
            self._cached_token_count += new_message_token_count
            logger.debug(
                f"Incrementally updated token count cache: +{new_message_token_count} tokens "
                f"(total: {self._cached_token_count})"
            )
        elif (
            cache_was_valid
            and history_length_before + len(stored_messages) != history_length_after
        ):
            # Pruning occurred, cache already invalidated by _prune_if_needed
            logger.debug("Token count cache invalidated due to history pruning")
        
        self._maybe_trim_old_images()

    def add_assistant_message(
        self,
        message: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Add an assistant response to the conversation history.

        Args:
            message: Assistant response text
            tool_calls: Optional native tool_calls payload for assistant tool turns
        """
        stored_msg = self._build_assistant_message(message, tool_calls=tool_calls)
        self._append_message(stored_msg)
        # Invalidate token count cache (new message added)
        self._invalidate_token_cache()
        self._prune_if_needed()

    def stage_tool_call_ids(
        self,
        tool_call_ids: List[str],
        consume_all_on_next_output: bool = False,
    ) -> None:
        """
        Stage tool-call ids so tool outputs can be recorded as `role=tool` messages.
        """
        self._pending_tool_call_ids = [
            tool_call_id
            for tool_call_id in tool_call_ids
            if isinstance(tool_call_id, str) and tool_call_id
        ]
        self._consume_all_tool_call_ids_on_next_output = (
            bool(consume_all_on_next_output) and bool(self._pending_tool_call_ids)
        )

    def get_history(self) -> List[LLMMessage]:
        """
        Get the current conversation history in LLM format.

        Returns cached LLM format (O(1) instead of O(n) conversion).
        Includes system prompt if stored. Tool outputs with screenshots are automatically
        converted to multimodal format (text + image) for LLM consumption.

        READ-ONLY CONTRACT: This method returns the internal cache directly for performance.
        Consumers MUST NOT mutate the returned messages. Use get_history_mutable() if
        mutation is required (e.g., for PII scrubbing or logging modifications).

        Returns:
            List of LLMMessage dicts ready for LLM consumption.
            Messages with image_data are converted to multimodal format with both
            text content and image_url.
        """
        messages: List[LLMMessage] = []

        # Include system prompt first if stored
        if self.system_prompt:
            messages.append({
                "role": MessageRole.SYSTEM.value,
                "content": self.system_prompt
            })

        # PERFORMANCE OPTIMIZATION: Return cache directly (read-only by contract)
        # This eliminates deep copy overhead on the hot path. If mutation is needed,
        # use get_history_mutable() instead.
        messages.extend(self._llm_history_cache)

        return messages

    def get_history_mutable(self) -> List[LLMMessage]:
        """
        Get a mutable copy of the current conversation history in LLM format.

        Use this method when you need to modify the returned messages (e.g., PII scrubbing,
        logging modifications). For read-only access, use get_history() which is faster.

        Returns:
            Deep-copied List of LLMMessage dicts. Safe to mutate.
        """
        messages: List[LLMMessage] = []

        # Include system prompt first if stored
        if self.system_prompt:
            messages.append({
                "role": MessageRole.SYSTEM.value,
                "content": self.system_prompt
            })

        # Return deep copies to prevent mutable state leakage
        messages.extend(copy.deepcopy(msg) for msg in self._llm_history_cache)

        return messages
    
    def get_stored_messages(self) -> List[StoredMessage]:
        """
        Get the current conversation history as StoredMessage objects.
        
        This provides access to message_type and other structured fields
        that are lost when converting to LLMMessage format.
        
        Returns:
            List of StoredMessage objects
        """
        return list(self.history)
    
    @property
    def last_user_query(self) -> Optional[StoredMessage]:
        """
        Get the last user query message.
        
        Returns:
            Last StoredMessage with message_type USER_QUERY, or None if no user queries exist
        """
        # Find last user query (typically near end, so reverse scan is fast)
        for msg in reversed(self.history):
            if msg.message_type == MessageType.USER_QUERY:
                return msg
        return None

    def get_token_count(self, model_id: str) -> int:
        """
        Get token count for the conversation history.
        
        Maintains a running count to avoid O(N^2) re-encoding on every turn.
        Cache is invalidated when messages are added or history is cleared.
        
        Args:
            model_id: Model ID for token counting (cache is per-model)
            
        Returns:
            Token count for the conversation history
        """
        from backend.src.services.token_service import get_token_service
        
        # Return cached count if available and for the same model
        if self._cached_token_count is not None and self._cached_token_count_model == model_id:
            return self._cached_token_count
        
        # Compute token count (O(N) operation)
        token_service = get_token_service()
        count = token_service.count_tokens(self.get_history(), model_id)
        
        # Cache the result
        self._cached_token_count = count
        self._cached_token_count_model = model_id
        
        return count

    def clear(self) -> None:
        """Clear all conversation history."""
        self.history = []
        self._llm_history_cache = []
        self._pending_tool_call_ids = []
        self._consume_all_tool_call_ids_on_next_output = False
        self._invalidate_token_cache()
        # Note: system_prompt is preserved on clear

    def set_image_trimming_enabled(self, enabled: bool) -> None:
        """Enable or disable automatic image trimming."""
        self._image_trimming_enabled = bool(enabled)
        if self._image_trimming_enabled:
            self._trim_old_images()

    def replace_with_entries(self, entries: List[Dict[str, Any]]) -> None:
        """Replace conversation history with provided stored entries."""
        self.clear()
        for entry in entries:
            message_type = self._normalize_message_type(
                role=entry.get("role"),
                message_type=entry.get("message_type"),
            )
            normalized_role = str(entry.get("role") or "").strip().lower()
            if normalized_role == MessageRole.TOOL.value:
                stored_role = MessageRole.TOOL
            elif normalized_role == MessageRole.ASSISTANT.value:
                # Preserve explicit assistant role for rehydrated tool-call turns.
                stored_role = MessageRole.ASSISTANT
            elif message_type == MessageType.ASSISTANT_RESPONSE:
                stored_role = MessageRole.ASSISTANT
            else:
                stored_role = MessageRole.USER
            stored_msg = StoredMessage(
                role=stored_role,
                content=str(entry.get("content") or ""),
                message_type=message_type,
                image_data=entry.get("image_data"),
                tool_call_id=entry.get("tool_call_id"),
                tool_name=entry.get("name"),
                tool_calls=entry.get("tool_calls"),
            )
            self._append_message(stored_msg)
        self._invalidate_token_cache()

    def _prune_if_needed(self) -> None:
        """Remove the oldest messages if the history exceeds the max length."""
        if len(self.history) > self.max_length:
            # Keep the most recent messages (prune both lists in sync)
            removed_count = len(self.history) - self.max_length
            self.history = self.history[-self.max_length :]
            self._llm_history_cache = self._llm_history_cache[-self.max_length :]
            # Invalidate token count cache (history changed)
            self._invalidate_token_cache()
            logger.debug(f"Pruned conversation history to {self.max_length} messages (removed {removed_count})")
    
    def _trim_old_images(self, keep_recent_images: int = 2) -> None:
        """
        Keep only the last keep_recent_images image-bearing messages; clear image_data from all others.
        
        RATIONALE: When a new screenshot arrives, the LLM compares previous screen state vs current
        to verify actions (e.g., "No Change" vs "Wrong Change"). Exactly two images (previous + current)
        are needed for that comparison; older images contribute nothing. Also limits memory and context
        (base64 screenshots can be ~10MB each).
        
        Args:
            keep_recent_images: Number of most recent images to keep (default: 2)
        """
        image_indices = [i for i, msg in enumerate(self.history) if msg.image_data]
        if len(image_indices) <= keep_recent_images:
            return  # Nothing to clear
        
        indices_to_clear = set(image_indices[:-keep_recent_images])
        cleared_count = 0
        for i in indices_to_clear:
            msg = self.history[i]
            msg.image_data = None
            cleared_count += 1
            self._llm_history_cache[i] = msg.to_llm_message()
        
        if cleared_count > 0:
            logger.debug(
                f"Cleared image data from {cleared_count} old messages "
                f"(keeping last {keep_recent_images} images) to limit memory and context size"
            )

    def _maybe_trim_old_images(self) -> None:
        if not self._image_trimming_enabled:
            return
        self._trim_old_images()

    def _normalize_message_type(
        self,
        role: Optional[Any],
        message_type: Optional[Any],
    ) -> MessageType:
        normalized = str(message_type or "").strip().lower().replace("-", "_")
        if normalized in {"tool", "tool_output", "tool_call"}:
            return MessageType.TOOL_OUTPUT
        if normalized in {"assistant", "assistant_response", "llm_text", "error"}:
            return MessageType.ASSISTANT_RESPONSE
        if normalized in {"user", "user_query", "query"}:
            return MessageType.USER_QUERY

        normalized_role = str(role or "").strip().lower()
        if normalized_role == "assistant":
            return MessageType.ASSISTANT_RESPONSE
        if normalized_role == "tool":
            return MessageType.TOOL_OUTPUT
        return MessageType.USER_QUERY

    def _invalidate_token_cache(self) -> None:
        self._cached_token_count = None
        self._cached_token_count_model = None

    def _append_message(
        self, stored_msg: StoredMessage, llm_msg: Optional[LLMMessage] = None
    ) -> None:
        self.history.append(stored_msg)
        self._llm_history_cache.append(
            llm_msg if llm_msg is not None else stored_msg.to_llm_message()
        )

    def _build_user_message(
        self,
        content: str,
        image_data: Optional[str],
        episodic_memory: Optional[List[str]],
        semantic_memory: Optional[List[str]],
        user_query_raw: Optional[str],
    ) -> StoredMessage:
        return StoredMessage(
            role=MessageRole.USER,
            content=content,
            message_type=MessageType.USER_QUERY,
            image_data=image_data,
            episodic_memory=episodic_memory,
            semantic_memory=semantic_memory,
            user_query_raw=user_query_raw,
        )

    def _build_tool_output_message(
        self, message: str, image_data: Optional[str]
    ) -> StoredMessage:
        return StoredMessage(
            role=MessageRole.USER,
            content=message,
            message_type=MessageType.TOOL_OUTPUT,
            image_data=image_data,
        )

    def _build_tool_result_message(
        self,
        message: str,
        tool_call_id: str,
    ) -> StoredMessage:
        return StoredMessage(
            role=MessageRole.TOOL,
            content=message,
            message_type=MessageType.TOOL_OUTPUT,
            image_data=None,
            tool_call_id=tool_call_id,
        )

    def _build_assistant_message(
        self,
        message: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
    ) -> StoredMessage:
        return StoredMessage(
            role=MessageRole.ASSISTANT,
            content=message,
            message_type=MessageType.ASSISTANT_RESPONSE,
            image_data=None,
            tool_calls=tool_calls,
        )

    def _consume_tool_call_ids_for_next_output(self) -> List[str]:
        """Consume staged tool-call ids for the next tool output message."""
        if not self._pending_tool_call_ids:
            return []
        if self._consume_all_tool_call_ids_on_next_output:
            tool_call_ids = list(self._pending_tool_call_ids)
            self._pending_tool_call_ids = []
            self._consume_all_tool_call_ids_on_next_output = False
            return tool_call_ids

        tool_call_id = self._pending_tool_call_ids.pop(0)
        if not self._pending_tool_call_ids:
            self._consume_all_tool_call_ids_on_next_output = False
        return [tool_call_id]
