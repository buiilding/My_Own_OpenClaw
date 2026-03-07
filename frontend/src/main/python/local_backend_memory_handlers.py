"""
Memory-specific handler mixin for LocalBackend JSON-RPC service.
"""

from __future__ import annotations

import json
import logging
from functools import wraps
from typing import Any, Awaitable, Callable, Dict, Optional

from memory.operations import (
    build_memory_filters,
    build_store_memory_response_data,
    exclude_conversation_results,
    format_interaction_memory,
    group_memory_texts,
    normalize_and_store_interaction_memory,
    normalize_search_memory_payload,
)
from core.unicode_sanitizer import (
    find_surrogate_paths,
    sanitize_surrogates,
    sanitize_surrogates_in_text,
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

    _ASSISTANT_RETRIEVAL_MESSAGE_TYPES = {"", "llm-text", "error"}

    @staticmethod
    def _normalize_transcript_transparency(
        transparency: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Validate transcript transparency payload is JSON-serializable object data."""
        if not isinstance(transparency, dict):
            return None
        sanitized_transparency = sanitize_surrogates(transparency)
        try:
            json.dumps(sanitized_transparency)
        except (TypeError, ValueError):
            logger.warning("Dropping non-serializable transcript transparency payload")
            return None
        return dict(sanitized_transparency)

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
            recovered_transcript_pairs = await self._recover_transcript_pairs_for_search_results(
                results=filtered_results,
                grouped_episodic=memories.get("episodic", []),
                user_id=user_id,
            )
            if recovered_transcript_pairs:
                memories["episodic"] = recovered_transcript_pairs

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

    @staticmethod
    def _normalize_message_index(value: Any) -> Optional[int]:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.isdigit():
                return int(stripped)
        return None

    @staticmethod
    def _extract_result_metadata(result: Dict[str, Any]) -> Dict[str, Any]:
        metadata = result.get("metadata")
        if isinstance(metadata, dict):
            return metadata
        return {}

    @classmethod
    def _has_interaction_memories(cls, episodic_memories: Any) -> bool:
        if not isinstance(episodic_memories, list):
            return False
        for entry in episodic_memories:
            if not isinstance(entry, str):
                continue
            normalized = entry.strip().lower()
            if "user:" in normalized and "assistant:" in normalized:
                return True
        return False

    @classmethod
    def _assistant_message_is_retrievable(cls, message_type: Optional[str]) -> bool:
        normalized = (message_type or "").strip().lower()
        return normalized in cls._ASSISTANT_RETRIEVAL_MESSAGE_TYPES

    async def _recover_transcript_pairs_for_search_results(
        self,
        *,
        results: list[Dict[str, Any]],
        grouped_episodic: Any,
        user_id: str,
    ) -> list[str]:
        """
        Best-effort fallback pairing for transcript-only search hits.

        Search top-k can return user transcript rows without the matching assistant
        row. When grouped episodic memories lack interaction-style pairs, fetch the
        assistant response from the same conversation window and synthesize pairs.
        """
        if self._has_interaction_memories(grouped_episodic):
            return []

        memory_store = getattr(self, "memory_store", None)
        if memory_store is None:
            return []

        getter = getattr(memory_store, "get_episodic_memories_by_conversation", None)
        if not callable(getter):
            return []

        transcript_candidates: list[tuple[str, int, str]] = []
        for result in results:
            if result.get("type") != "episodic":
                continue
            text = result.get("text")
            if not isinstance(text, str) or not text.strip():
                continue

            metadata = self._extract_result_metadata(result)
            record_kind = str(
                result.get("record_kind")
                or metadata.get("record_kind")
                or ""
            ).strip().lower()
            role = str(
                result.get("role")
                or metadata.get("role")
                or ""
            ).strip().lower()
            conversation_id = (
                result.get("conversation_id")
                or metadata.get("conversation_id")
            )
            message_index = self._normalize_message_index(
                result.get("message_index", metadata.get("message_index"))
            )

            if record_kind != "transcript" or role != "user":
                continue
            if not isinstance(conversation_id, str) or not conversation_id.strip():
                continue
            if message_index is None:
                continue

            transcript_candidates.append((conversation_id.strip(), message_index, text))

        if not transcript_candidates:
            return []

        recovered_pairs: list[str] = []
        seen_pair_keys: set[tuple[str, int]] = set()
        for conversation_id, user_message_index, user_text in transcript_candidates:
            pair_key = (conversation_id, user_message_index)
            if pair_key in seen_pair_keys:
                continue

            conversation_rows = await getter(
                user_id=user_id,
                conversation_id=conversation_id,
                limit=30,
                record_kind="transcript",
                after_message_index=user_message_index,
            )
            if not isinstance(conversation_rows, list):
                continue

            assistant_text: Optional[str] = None
            for row in conversation_rows:
                if not isinstance(row, dict):
                    continue
                row_metadata = row.get("metadata")
                if not isinstance(row_metadata, dict):
                    row_metadata = {}

                row_role = str(
                    row.get("role")
                    or row_metadata.get("role")
                    or ""
                ).strip().lower()
                if row_role != "assistant":
                    continue

                row_message_type = (
                    row.get("message_type")
                    or row_metadata.get("message_type")
                )
                if not self._assistant_message_is_retrievable(row_message_type):
                    continue

                row_message_index = self._normalize_message_index(
                    row.get("message_index", row_metadata.get("message_index"))
                )
                if (
                    row_message_index is not None
                    and row_message_index <= user_message_index
                ):
                    continue

                content = row.get("content")
                if not isinstance(content, str) or not content.strip():
                    continue
                assistant_text = content
                break

            if not assistant_text:
                continue

            recovered_pairs.append(format_interaction_memory(user_text, assistant_text))
            seen_pair_keys.add(pair_key)

        return recovered_pairs

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
        transparency: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Store a transcript entry with selective embeddings for recall/summarization."""
        if not content:
            return {
                "success": False,
                "error": "Content is required"
            }

        try:
            surrogate_paths = find_surrogate_paths(
                {
                    "content": content,
                    "user_id": user_id,
                    "conversation_ref": conversation_ref,
                    "session_id": session_id,
                    "role": role,
                    "message_type": message_type,
                    "tool_name": tool_name,
                    "correlation_id": correlation_id,
                    "model_id": model_id,
                    "model_provider": model_provider,
                },
                root="store_transcript",
            )
            if surrogate_paths:
                logger.warning(
                    "Lone surrogate detected in transcript payload fields: %s",
                    ", ".join(surrogate_paths),
                )
            content = sanitize_surrogates_in_text(content)
            record_kind = "transcript"
            conversation_id = conversation_ref or session_id
            normalized_correlation_id = None
            if isinstance(correlation_id, str):
                trimmed_correlation_id = correlation_id.strip()
                if trimmed_correlation_id:
                    normalized_correlation_id = trimmed_correlation_id
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
            if normalized_correlation_id:
                metadata["correlation_id"] = normalized_correlation_id
            normalized_transparency = self._normalize_transcript_transparency(transparency)
            if normalized_transparency is not None:
                metadata["transparency"] = normalized_transparency

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
                correlation_id=normalized_correlation_id,
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
            surrogate_paths = find_surrogate_paths(
                {
                    "user_query": user_query,
                    "assistant_response": assistant_response,
                    "memory_type": memory_type,
                    "user_id": user_id,
                    "session_id": session_id,
                },
                root="store_memory",
            )
            if surrogate_paths:
                logger.warning(
                    "Lone surrogate detected in interaction-memory payload fields: %s",
                    ", ".join(surrogate_paths),
                )
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
