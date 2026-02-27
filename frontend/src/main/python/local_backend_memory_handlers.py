"""
Memory-specific handler mixin for LocalBackend JSON-RPC service.
"""

from __future__ import annotations

import logging
from functools import wraps
from typing import Any, Awaitable, Callable, Dict, Optional

from memory.operations import (
    build_memory_filters,
    build_store_memory_response_data,
    exclude_conversation_results,
    group_memory_texts,
    normalize_and_store_interaction_memory,
    normalize_search_memory_payload,
)

logger = logging.getLogger(__name__)


def requires_memory_store(
    handler: Callable[..., Awaitable[Dict[str, Any]]],
) -> Callable[..., Awaitable[Dict[str, Any]]]:
    """Ensure memory handlers consistently fail when the store is unavailable."""

    @wraps(handler)
    async def wrapper(self: "LocalBackendMemoryHandlersMixin", *args, **kwargs) -> Dict[str, Any]:
        if self.memory_store is None:
            return self._memory_store_not_initialized_response()
        return await handler(self, *args, **kwargs)

    return wrapper


class LocalBackendMemoryHandlersMixin:
    """Memory RPC handlers shared by the local backend service."""

    @staticmethod
    def _is_semantic_transcript_candidate(
        role: Optional[str],
        message_type: Optional[str],
    ) -> bool:
        """Return True when a transcript entry should be embedded/summarized."""
        normalized_role = (role or "").strip().lower()
        normalized_type = (message_type or "").strip().lower()

        if normalized_role == "user":
            return True

        if normalized_role == "assistant":
            return normalized_type in ("", "llm-text", "error")

        return False

    @staticmethod
    def _memory_store_not_initialized_response() -> Dict[str, Any]:
        """Canonical response shape for memory handlers when store is unavailable."""
        return {
            "success": False,
            "error": "Memory store not initialized",
        }

    async def _maybe_notify_summarizer(
        self,
        *,
        should_notify: bool,
        user_id: str,
    ) -> None:
        """
        Best-effort summarizer notification for new episodic interactions.

        Summarizer run gating now comes from DB counts, so this only nudges the
        active summarizer with user activity and never mutates watermark counters.
        """
        if not should_notify:
            return

        if self._summarizer is None:
            return

        try:
            self._summarizer.notify_new_memory(user_id)
        except Exception as e:
            logger.warning(f"Failed to notify summarizer about new interaction: {e}")

    @requires_memory_store
    async def _handle_search_memory(
        self,
        query: str,
        user_id: str = "default_user",
        limit: int = 5,
        memory_type: str = None,
        exclude_conversation_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Search memory."""
        normalized, error = normalize_search_memory_payload(
            query=query,
            memory_type=memory_type,
        )
        if error:
            return {
                "success": False,
                "error": error,
            }

        query = normalized["query"]
        memory_type = normalized["memory_type"]
        try:
            filters = build_memory_filters(memory_type)
            results = await self.memory_store.search(query, user_id, filters, limit)
            filtered_results = exclude_conversation_results(results, exclude_conversation_id)
            memories = group_memory_texts(filtered_results)

            return {
                "success": True,
                "data": {
                    "memories": memories
                }
            }
        except Exception as e:
            logger.error(f"Memory search failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_search_conversations(
        self,
        query: str,
        user_id: str = "default_user",
        limit: int = 40,
        **kwargs,
    ) -> Dict[str, Any]:
        """Search transcript conversations by message content."""
        try:
            conversations = await self.memory_store.search_conversations(
                user_id=user_id,
                query=query,
                limit=limit,
            )
            return {
                "success": True,
                "data": {
                    "query": query,
                    "conversations": conversations,
                    "count": len(conversations),
                }
            }
        except Exception as e:
            logger.error(f"Conversation search failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_list_conversations(
        self,
        user_id: str = "default_user",
        limit: int = 200,
        record_kind: Optional[str] = "transcript",
        **kwargs,
    ) -> Dict[str, Any]:
        """List episodic conversation windows."""
        try:
            conversations = await self.memory_store.list_conversations(user_id, limit, record_kind)
            return {
                "success": True,
                "data": {
                    "conversations": conversations,
                    "count": len(conversations),
                }
            }
        except Exception as e:
            logger.error(f"Conversation listing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_list_episodic_memories(
        self,
        user_id: str = "default_user",
        limit: int = 200,
        **kwargs,
    ) -> Dict[str, Any]:
        """List episodic memory entries excluding transcript conversation rows."""
        try:
            memories = await self.memory_store.list_episodic_memories(user_id, limit)
            return {
                "success": True,
                "data": {
                    "memories": memories,
                    "count": len(memories),
                }
            }
        except Exception as e:
            logger.error(f"Episodic memory listing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_get_conversation(
        self,
        conversation_id: Optional[str] = None,
        user_id: str = "default_user",
        limit: int = 1000,
        record_kind: Optional[str] = "transcript",
        after_message_index: Optional[int] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Get episodic memories for a conversation window."""
        try:
            memories = await self.memory_store.get_episodic_memories_by_conversation(
                user_id,
                conversation_id,
                limit,
                record_kind=record_kind,
                after_message_index=after_message_index,
            )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "memories": memories,
                    "count": len(memories),
                }
            }
        except Exception as e:
            logger.error(f"Conversation fetch failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_list_semantic_memories(
        self,
        user_id: str = "default_user",
        limit: int = 200,
        **kwargs,
    ) -> Dict[str, Any]:
        """List semantic memories for a user."""
        try:
            memories = await self.memory_store.list_semantic_memories(user_id, limit)
            return {
                "success": True,
                "data": {
                    "memories": memories,
                    "count": len(memories),
                }
            }
        except Exception as e:
            logger.error(f"Semantic memory listing failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_delete_episodic_memory(
        self,
        user_id: str = "default_user",
        memory_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete a non-transcript episodic memory entry."""
        if not memory_id:
            return {
                "success": False,
                "error": "memory_id is required"
            }

        try:
            deleted = await self.memory_store.delete_episodic_memory(
                user_id=user_id,
                memory_id=memory_id,
            )
            return {
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "deleted": bool(deleted),
                }
            }
        except Exception as e:
            logger.error(f"Episodic memory deletion failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_delete_conversation(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        record_kind: Optional[str] = "transcript",
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete episodic memories for a conversation window."""
        try:
            deleted_count = await self.memory_store.delete_conversation(
                user_id=user_id,
                conversation_id=conversation_id,
                record_kind=record_kind,
            )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "record_kind": record_kind,
                    "deleted_count": deleted_count,
                }
            }
        except Exception as e:
            logger.error(f"Conversation deletion failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_delete_semantic_memory(
        self,
        user_id: str = "default_user",
        memory_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete a semantic memory entry."""
        if not memory_id:
            return {
                "success": False,
                "error": "memory_id is required"
            }

        try:
            deleted = await self.memory_store.delete_semantic_memory(
                user_id=user_id,
                memory_id=memory_id,
            )
            return {
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "deleted": bool(deleted),
                }
            }
        except Exception as e:
            logger.error(f"Semantic memory deletion failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_store_transcript(
        self,
        content: str,
        user_id: str = "default_user",
        conversation_ref: Optional[str] = None,
        session_id: Optional[str] = None,
        role: Optional[str] = None,
        message_type: Optional[str] = None,
        tool_name: Optional[str] = None,
        correlation_id: Optional[str] = None,
        message_index: Optional[int] = None,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
        screenshot: Optional[str] = None,
        timestamp: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Store a transcript entry with selective embeddings for recall/summarization."""
        if not content:
            return {
                "success": False,
                "error": "Content is required"
            }

        try:
            record_kind = "transcript"
            conversation_id = conversation_ref or session_id
            metadata = {
                "type": "episodic",
                "record_kind": record_kind,
            }
            if role:
                metadata["role"] = role
            if message_type:
                metadata["message_type"] = message_type
            if tool_name:
                metadata["tool_name"] = tool_name
            if correlation_id:
                metadata["correlation_id"] = correlation_id

            if message_index is None:
                message_index = await self.memory_store.get_next_message_index(
                    user_id, conversation_id
                )

            semantic_candidate = self._is_semantic_transcript_candidate(role, message_type)

            memory_id = await self.memory_store.add(
                content,
                user_id,
                metadata,
                conversation_id=conversation_id,
                record_kind=record_kind,
                role=role,
                message_index=message_index,
                message_type=message_type,
                tool_name=tool_name,
                correlation_id=correlation_id,
                model_id=model_id,
                model_provider=model_provider,
                screenshot=screenshot,
                skip_embedding=not semantic_candidate,
                timestamp=timestamp,
            )

            return {
                "success": True,
                "data": {
                    "memory_id": memory_id,
                    "message_index": message_index,
                    "record_kind": record_kind,
                    "semantic_candidate": semantic_candidate,
                }
            }
        except Exception as e:
            logger.error(f"Transcript store failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    @requires_memory_store
    async def _handle_store_memory(
        self,
        user_query: str,
        assistant_response: str,
        memory_type: str = "episodic",
        user_id: str = "default_user",
        session_id: str = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Store memory."""
        try:
            stored, error = await normalize_and_store_interaction_memory(
                self.memory_store,
                user_query=user_query,
                assistant_response=assistant_response,
                memory_type=memory_type,
                user_id=user_id,
                session_id=session_id,
            )
            if error:
                return {
                    "success": False,
                    "error": error,
                }

            memory_type = stored["memory_type"]
            await self._maybe_notify_summarizer(
                should_notify=(memory_type == "episodic"),
                user_id=user_id,
            )

            return {
                "success": True,
                "data": build_store_memory_response_data(
                    memory_id=stored["memory_id"],
                    memory_type=memory_type,
                ),
            }
        except Exception as e:
            logger.error(f"Memory store failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
