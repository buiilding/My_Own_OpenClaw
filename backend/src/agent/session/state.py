"""
Conversation History Manager for maintaining conversation state.

This module manages the conversation history, including pruning to prevent
context window overflow.
"""

import copy
import logging
from typing import List, Optional

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
        For the first message only, tool schemas are embedded in content as a <tool_schemas> XML section.

        MEMORY DOS PROTECTION: Only the two most recent images are kept. When a new screenshot
        arrives, the LLM compares previous state vs current state to verify actions; older
        images add no value to that comparison. Text content is preserved for context.

        Args:
            content: Message content (context + memory + query, WITH tool schemas for first message only)
            image_data: Optional base64 image data (cleared except for the 2 most recent images to limit memory DoS)
            episodic_memory: Optional list of episodic memory strings (structured data)
            semantic_memory: Optional list of semantic memory strings (structured data)
            user_query_raw: Optional raw user query text (structured data)
        """
        stored_msg = StoredMessage(
            role=MessageRole.USER,
            content=content,  # Content without tool schemas
            message_type=MessageType.USER_QUERY,
            image_data=image_data,
            episodic_memory=episodic_memory,
            semantic_memory=semantic_memory,
            user_query_raw=user_query_raw,
        )
        self.history.append(stored_msg)
        # Convert and append to LLM cache immediately (O(1) per message)
        llm_msg = stored_msg.to_llm_message()
        self._llm_history_cache.append(llm_msg)
        # Invalidate token count cache (new message added)
        self._cached_token_count = None
        self._cached_token_count_model = None
        self._prune_if_needed()
        # Keep only the 2 most recent images (previous + current) for before/after comparison; clear older ones
        self._clear_old_image_data()

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
        stored_msg = StoredMessage(
            role=MessageRole.USER,
            content=message,
            message_type=MessageType.TOOL_OUTPUT,
            image_data=image_data  # Screenshots are stored here and included in LLM history
        )
        
        # INCREMENTAL TOKEN COUNT: If cache is valid, count new message before pruning
        # This avoids O(N) re-counting when multiple tools are called in sequence
        new_message_token_count = None
        cache_was_valid = (
            self._cached_token_count is not None 
            and self._cached_token_count_model is not None
        )
        
        # Convert to LLM format once (used for both token counting and cache)
        llm_msg = stored_msg.to_llm_message()
        
        if cache_was_valid:
            # Count tokens for the new message only (O(1) operation)
            from backend.src.services.token_service import get_token_service
            token_service = get_token_service()
            new_message_token_count = token_service.count_message_tokens(
                llm_msg, 
                self._cached_token_count_model
            )
        
        # Store history length before pruning to detect if pruning occurred
        history_length_before = len(self.history)
        
        self.history.append(stored_msg)
        # Append to LLM cache immediately (O(1) per message)
        self._llm_history_cache.append(llm_msg)
        
        # Prune if needed (this may invalidate cache if pruning occurs)
        self._prune_if_needed()
        
        # INCREMENTAL UPDATE: If cache was valid and no pruning occurred, update incrementally
        # If pruning occurred, _prune_if_needed already invalidated the cache
        history_length_after = len(self.history)
        if (
            cache_was_valid 
            and history_length_before + 1 == history_length_after  # No pruning occurred
            and new_message_token_count is not None
        ):
            # Incrementally update cache instead of invalidating
            self._cached_token_count += new_message_token_count
            logger.debug(
                f"Incrementally updated token count cache: +{new_message_token_count} tokens "
                f"(total: {self._cached_token_count})"
            )
        elif cache_was_valid and history_length_before + 1 != history_length_after:
            # Pruning occurred, cache already invalidated by _prune_if_needed
            logger.debug("Token count cache invalidated due to history pruning")
        
        # Keep only the 2 most recent images (previous + current) so the LLM can compare screen
        # state before/after actions; older images add no value. Also prevents memory spikes during
        # tool loops (screenshots ~5-10MB each).
        self._clear_old_image_data()

    def add_assistant_message(self, message: str) -> None:
        """
        Add an assistant response to the conversation history.

        Args:
            message: Assistant response text
        """
        stored_msg = StoredMessage(
            role=MessageRole.ASSISTANT,
            content=message,
            message_type=MessageType.ASSISTANT_RESPONSE,
            image_data=None
        )
        self.history.append(stored_msg)
        # Convert and append to LLM cache immediately (O(1) per message)
        llm_msg = stored_msg.to_llm_message()
        self._llm_history_cache.append(llm_msg)
        # Invalidate token count cache (new message added)
        self._cached_token_count = None
        self._cached_token_count_model = None
        self._prune_if_needed()

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
        self._cached_token_count = None
        self._cached_token_count_model = None
        # Note: system_prompt is preserved on clear

    def _prune_if_needed(self) -> None:
        """Remove the oldest messages if the history exceeds the max length."""
        if len(self.history) > self.max_length:
            # Keep the most recent messages (prune both lists in sync)
            removed_count = len(self.history) - self.max_length
            self.history = self.history[-self.max_length :]
            self._llm_history_cache = self._llm_history_cache[-self.max_length :]
            # Invalidate token count cache (history changed)
            self._cached_token_count = None
            self._cached_token_count_model = None
            logger.debug(f"Pruned conversation history to {self.max_length} messages (removed {removed_count})")
    
    def _clear_old_image_data(self, keep_recent_images: int = 2) -> None:
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

