"""Conversation history manager for maintaining stored and LLM-ready state."""

import copy
import re
from typing import Any, Dict, List, Optional, Union

from backend.src.agent.history.history_admission import (
    normalize_assistant_history_structured_content,
    normalize_history_structured_content,
    normalize_history_text_content,
    should_store_assistant_history_message,
)
from backend.src.agent.session.message_builders import (
    build_assistant_message,
    build_tool_output_message,
    build_tool_result_message,
    build_user_message,
    normalize_message_type,
)
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.core.types.schemas import LLMMessage


class ConversationHistory:
    """
    Manages conversation history without count-based pruning.

    History stores messages in structured StoredMessage format for type safety.
    Maintains a cached LLMMessage format for O(1) retrieval instead of O(n) conversion.
    """

    def __init__(self, system_prompt: Optional[str] = None):
        """
        Initialize the conversation history.

        Args:
            system_prompt: System prompt to store and include in history
        """
        # Internal format: List of StoredMessage instances
        self.history: List[StoredMessage] = []
        # Cached LLM format for O(1) retrieval (updated incrementally)
        self._llm_history_cache: List[LLMMessage] = []
        self.system_prompt: Optional[str] = system_prompt
        self._pending_tool_call_ids: List[str] = []
        self._consume_all_tool_call_ids_on_next_output = False

        # Running token count to avoid O(N^2) re-encoding on every turn
        # Updated incrementally when messages are added
        self._cached_token_count: Optional[int] = None
        self._cached_token_count_model: Optional[str] = (
            None  # Model ID for which count is cached
        )

    def add_user_message(
        self,
        content: str,
        image_data: Optional[Union[str, List[str]]] = None,
        image_refs: Optional[List[str]] = None,
        image_owner_user_id: Optional[str] = None,
        episodic_memory: Optional[List[str]] = None,
        semantic_memory: Optional[List[str]] = None,
        user_query_raw: Optional[str] = None,
    ) -> None:
        """
        Add an actual user message to the conversation history.
        Content includes context XML, memory sections, and user query.

        Args:
            content: Message content (context + memory + query)
            image_data: Optional base64 image payload(s)
            image_refs: Optional artifact-backed prompt image refs
            image_owner_user_id: Owner id used to authorize image ref hydration
            episodic_memory: Optional list of episodic memory strings (structured data)
            semantic_memory: Optional list of semantic memory strings (structured data)
            user_query_raw: Optional raw user query text (structured data)
        """
        stored_msg = build_user_message(
            content=content,
            image_data=image_data,
            image_refs=image_refs,
            image_owner_user_id=image_owner_user_id,
            episodic_memory=episodic_memory,
            semantic_memory=semantic_memory,
            user_query_raw=user_query_raw,
        )
        self._append_message(stored_msg)
        # Invalidate token count cache (new message added)
        self._invalidate_token_cache()

    def add_tool_output(
        self,
        message: str,
        image_data: Optional[Union[str, List[str]]] = None,
        *,
        tool_name: Optional[str] = None,
        compaction_facts: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Add a tool execution result to the conversation history.
        These messages do NOT trigger memory retrieval.

        Tool outputs are stored with their screenshots (if available) and included
        in conversation history. Screenshots are automatically converted to multimodal
        format when history is retrieved for LLM consumption.

        Frontend sends raw tool output in `data.output`. Backend projection owns
        model-facing formatting/truncation before the result reaches history.
        Structured runtime state and screenshots travel separately in tool-result payloads.

        Args:
            message: Tool output message text (pre-formatted by frontend)
            image_data: Optional base64 image payload(s) for screenshots. Automatically captured
                       by the frontend after tool execution. Included in history
                       and sent to LLM as multimodal content.
        """
        tool_call_ids = self._consume_tool_call_ids_for_next_output()
        stored_messages: List[StoredMessage] = []
        if tool_call_ids:
            for index, tool_call_id in enumerate(tool_call_ids):
                stored_messages.append(
                    build_tool_result_message(
                        message=message,
                        tool_call_id=tool_call_id,
                        image_data=image_data if index == 0 else None,
                        tool_name=tool_name,
                        compaction_facts=compaction_facts,
                    )
                )
        else:
            # Fallback path when no tool_call_id linkage exists.
            stored_messages.append(
                build_tool_output_message(
                    message,
                    image_data,
                    tool_name=tool_name,
                    compaction_facts=compaction_facts,
                )
            )

        # INCREMENTAL TOKEN COUNT: If cache is valid, count new message before append
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

        for stored_msg, llm_msg in zip(stored_messages, llm_messages):
            self._append_message(stored_msg, llm_msg)

        # INCREMENTAL UPDATE: If cache was valid, update incrementally.
        if cache_was_valid:
            # Incrementally update cache instead of invalidating
            self._cached_token_count += new_message_token_count

    def add_assistant_message(
        self,
        message: Any,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Add an assistant response to the conversation history.

        Args:
            message: Assistant response text
            tool_calls: Optional native tool_calls payload for assistant tool turns
        """
        normalized_message = normalize_history_text_content(message)
        structured_content = normalize_assistant_history_structured_content(message)
        if not should_store_assistant_history_message(
            message,
            tool_calls=tool_calls,
        ):
            return
        stored_msg = build_assistant_message(
            message=normalized_message,
            structured_content=structured_content,
            tool_calls=tool_calls,
        )
        self._append_message(stored_msg)
        # Invalidate token count cache (new message added)
        self._invalidate_token_cache()

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
        self._consume_all_tool_call_ids_on_next_output = bool(
            consume_all_on_next_output
        ) and bool(self._pending_tool_call_ids)

    def finalize_pending_tool_calls_as_cancelled(
        self,
        message: str = "Tool execution cancelled by user before completion.",
    ) -> int:
        """
        Reconcile staged tool_call_ids after cancellation.

        When a query is cancelled mid-tool loop, assistant tool_call rows may already
        be in history while the matching role=tool outputs are still pending. This
        method emits synthetic role=tool outputs for every staged tool_call_id so the
        next LLM request has a valid assistant->tool_calls->tool_output sequence.

        Args:
            message: Synthetic tool output content to record for each pending tool call.

        Returns:
            Number of synthetic tool output rows written.
        """
        if not self._pending_tool_call_ids:
            return 0

        pending_tool_call_ids = list(self._pending_tool_call_ids)
        self._pending_tool_call_ids = []
        self._consume_all_tool_call_ids_on_next_output = False

        for tool_call_id in pending_tool_call_ids:
            self._append_message(
                build_tool_result_message(
                    message=message,
                    tool_call_id=tool_call_id,
                )
            )

        self._invalidate_token_cache()
        return len(pending_tool_call_ids)

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
            messages.append(
                {"role": MessageRole.SYSTEM.value, "content": self.system_prompt}
            )

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
            messages.append(
                {"role": MessageRole.SYSTEM.value, "content": self.system_prompt}
            )

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
        if (
            self._cached_token_count is not None
            and self._cached_token_count_model == model_id
        ):
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

    def replace_with_entries(self, entries: List[Dict[str, Any]]) -> None:
        """Replace conversation history with provided stored entries."""
        stored_messages: List[StoredMessage] = []
        for entry in entries:
            message_type = normalize_message_type(
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
            raw_content = entry.get("structured_content", entry.get("content"))
            normalized_content = normalize_history_text_content(raw_content)
            tool_calls = entry.get("tool_calls")
            structured_content = normalize_history_structured_content(
                raw_content,
                role=stored_role.value,
            )
            if (
                stored_role == MessageRole.ASSISTANT
                and not should_store_assistant_history_message(
                    raw_content,
                    tool_calls=tool_calls,
                )
            ):
                continue
            stored_msg = StoredMessage(
                role=stored_role,
                content=normalized_content,
                message_type=message_type,
                structured_content=structured_content,
                image_data=entry.get("image_data"),
                image_refs=entry.get("image_refs"),
                image_owner_user_id=entry.get("image_owner_user_id"),
                user_query_raw=(
                    self._extract_user_query(normalized_content)
                    if message_type == MessageType.USER_QUERY
                    else None
                ),
                tool_call_id=entry.get("tool_call_id"),
                tool_name=entry.get("tool_name") or entry.get("name"),
                tool_calls=tool_calls,
                compaction_facts=entry.get("compaction_facts"),
            )
            stored_messages.append(stored_msg)
        self.replace_with_stored_messages(stored_messages)

    def replace_with_stored_messages(self, messages: List[StoredMessage]) -> None:
        """Replace conversation history with pre-built stored messages atomically."""
        self.clear()
        for message in messages:
            self._append_message(message)
        self._invalidate_token_cache()

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

    @staticmethod
    def _extract_user_query(content: str) -> Optional[str]:
        match = re.search(r"<user_query>\s*(.*?)\s*</user_query>", content, re.DOTALL)
        if not match:
            return None
        extracted = match.group(1).strip()
        return extracted or None

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
