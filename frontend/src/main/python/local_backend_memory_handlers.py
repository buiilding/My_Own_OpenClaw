"""
Memory-specific handler mixin for LocalBackend JSON-RPC service.
"""

from __future__ import annotations

import asyncio
import json
import logging
from functools import wraps
from typing import Any, Awaitable, Callable, Dict, List, Optional

from path_trace import build_sidecar_memory_search_trace, monotonic_trace_start
from memory.operations import (
    build_memory_filters,
    build_store_memory_response_data,
    exclude_conversation_results,
    filter_results_by_min_score,
    group_memory_texts,
    normalize_and_store_memory_by_embedding,
    normalize_search_memory_embedding_payload,
    normalize_search_memory_payload,
    normalize_search_memory_selection,
)
from memory.conversation_title_store import (
    get_conversation_title_state,
    upsert_generated_conversation_title,
)
from windie._unicode_sanitizer import (
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
    async def wrapper(
        self: "LocalBackendMemoryHandlersMixin", *args, **kwargs
    ) -> Dict[str, Any]:
        if self.memory_store is None:
            wait_for_initialization = getattr(
                self, "_wait_for_memory_runtime_initialization", None
            )
            if callable(wait_for_initialization):
                await wait_for_initialization()
        if self.memory_store is None:
            return self._memory_store_not_initialized_response()
        return await handler(self, *args, **kwargs)

    return wrapper


class LocalBackendMemoryHandlersMixin:
    """Memory RPC handlers shared by the local backend service."""

    @staticmethod
    def _normalize_transcript_structured_payload(
        structured_payload: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Validate transcript structured payload is JSON-serializable object data."""
        if not isinstance(structured_payload, dict):
            return None
        sanitized_payload = sanitize_surrogates(structured_payload)
        try:
            json.dumps(sanitized_payload)
        except (TypeError, ValueError):
            logger.warning("Dropping non-serializable transcript structured payload")
            return None
        return dict(sanitized_payload)

    @staticmethod
    def _normalize_attachment_payload(attachments: Optional[List[Any]]) -> List[Any]:
        """Validate chat-event attachments payload is JSON-serializable array data."""
        if not isinstance(attachments, list):
            return []
        sanitized_payload = sanitize_surrogates(attachments)
        try:
            json.dumps(sanitized_payload)
        except (TypeError, ValueError):
            logger.warning("Dropping non-serializable chat event attachments payload")
            return []
        return list(sanitized_payload)

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
        selection, error = normalize_search_memory_selection(
            limit=limit,
            episodic_limit=kwargs.get("episodic_limit"),
            semantic_limit=kwargs.get("semantic_limit"),
            semantic_min_score=kwargs.get("semantic_min_score"),
        )
        if error:
            return {
                "success": False,
                "error": error,
            }

        try:
            memories = await self._retrieve_grouped_memories(
                query=query,
                user_id=user_id,
                memory_type=memory_type,
                exclude_conversation_id=exclude_conversation_id,
                selection=selection,
            )

            return {"success": True, "data": {"memories": memories}}
        except Exception as e:
            logger.error(f"Memory search failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_search_memory_by_embedding(
        self,
        embedding,
        user_id: str = "default_user",
        limit: int = 5,
        memory_type: str = None,
        exclude_conversation_id: Optional[str] = None,
        embedding_space_version: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Search memory using an SDK-provided query embedding."""
        started_at = monotonic_trace_start()
        normalized, error = normalize_search_memory_embedding_payload(
            embedding=embedding,
            memory_type=memory_type,
            embedding_space_version=embedding_space_version,
        )
        if error:
            return {
                "success": False,
                "error": error,
            }

        selection, error = normalize_search_memory_selection(
            limit=limit,
            episodic_limit=kwargs.get("episodic_limit"),
            semantic_limit=kwargs.get("semantic_limit"),
            semantic_min_score=kwargs.get("semantic_min_score"),
        )
        if error:
            return {
                "success": False,
                "error": error,
            }

        try:
            memories = await self._retrieve_grouped_memories_by_embedding(
                embedding=normalized["embedding"],
                embedding_space_version=normalized["embedding_space_version"],
                user_id=user_id,
                memory_type=normalized["memory_type"],
                exclude_conversation_id=exclude_conversation_id,
                selection=selection,
            )
            return {
                "success": True,
                "data": {
                    "memories": memories,
                    "trace": build_sidecar_memory_search_trace(
                        method="search_memory_by_embedding",
                        memory_type=normalized["memory_type"],
                        embedding_dimension=len(normalized["embedding"]),
                        embedding_space_version=normalized["embedding_space_version"],
                        selection=selection,
                        exclude_conversation_id=exclude_conversation_id,
                        memories=memories,
                        started_at=started_at,
                    ),
                },
            }
        except Exception as e:
            logger.error(f"Embedding memory search failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    async def _retrieve_grouped_memories(
        self,
        *,
        query: str,
        user_id: str,
        memory_type: Optional[str],
        exclude_conversation_id: Optional[str],
        selection: Dict[str, Any],
    ) -> Dict[str, Any]:
        if memory_type is not None or not selection["use_balanced_limits"]:
            filters = build_memory_filters(memory_type)
            results = await self.memory_store.search(
                query,
                user_id,
                filters,
                selection["limit"],
            )
            filtered_results = exclude_conversation_results(
                results,
                exclude_conversation_id,
            )
            if memory_type == "semantic":
                filtered_results = filter_results_by_min_score(
                    filtered_results,
                    selection["semantic_min_score"],
                )
            return group_memory_texts(filtered_results)

        episodic_limit = selection["episodic_limit"] or selection["limit"]
        semantic_limit = selection["semantic_limit"] or selection["limit"]
        episodic_results, semantic_results = await asyncio.gather(
            self.memory_store.search(
                query,
                user_id,
                build_memory_filters("episodic"),
                episodic_limit,
            ),
            self.memory_store.search(
                query,
                user_id,
                build_memory_filters("semantic"),
                semantic_limit,
            ),
        )

        filtered_episodic_results = exclude_conversation_results(
            episodic_results,
            exclude_conversation_id,
        )
        filtered_semantic_results = filter_results_by_min_score(
            semantic_results,
            selection["semantic_min_score"],
        )
        return group_memory_texts(
            [*filtered_episodic_results, *filtered_semantic_results]
        )

    async def _retrieve_grouped_memories_by_embedding(
        self,
        *,
        embedding,
        embedding_space_version: Optional[str],
        user_id: str,
        memory_type: Optional[str],
        exclude_conversation_id: Optional[str],
        selection: Dict[str, Any],
    ) -> Dict[str, Any]:
        if memory_type is not None or not selection["use_balanced_limits"]:
            filters = build_memory_filters(memory_type)
            results = await self.memory_store.search_by_embedding(
                embedding,
                user_id,
                filters,
                selection["limit"],
                embedding_space_version=embedding_space_version,
            )
            filtered_results = exclude_conversation_results(
                results,
                exclude_conversation_id,
            )
            if memory_type == "semantic":
                filtered_results = filter_results_by_min_score(
                    filtered_results,
                    selection["semantic_min_score"],
                )
            return group_memory_texts(filtered_results)

        episodic_limit = selection["episodic_limit"] or selection["limit"]
        semantic_limit = selection["semantic_limit"] or selection["limit"]
        episodic_results, semantic_results = await asyncio.gather(
            self.memory_store.search_by_embedding(
                embedding,
                user_id,
                build_memory_filters("episodic"),
                episodic_limit,
                embedding_space_version=embedding_space_version,
            ),
            self.memory_store.search_by_embedding(
                embedding,
                user_id,
                build_memory_filters("semantic"),
                semantic_limit,
                embedding_space_version=embedding_space_version,
            ),
        )

        filtered_episodic_results = exclude_conversation_results(
            episodic_results,
            exclude_conversation_id,
        )
        filtered_semantic_results = filter_results_by_min_score(
            semantic_results,
            selection["semantic_min_score"],
        )
        return group_memory_texts(
            [*filtered_episodic_results, *filtered_semantic_results]
        )

    @requires_memory_store
    async def _handle_list_episodic_memories(
        self,
        user_id: str = "default_user",
        limit: int = 200,
        **kwargs,
    ) -> Dict[str, Any]:
        """List completed-turn interaction memories for the episodic memory surface."""
        try:
            memories = await self.memory_store.list_episodic_memories(user_id, limit)
            return {
                "success": True,
                "data": {
                    "memories": memories,
                    "count": len(memories),
                },
            }
        except Exception as e:
            logger.error(f"Episodic memory listing failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

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
                },
            }
        except Exception as e:
            logger.error(f"Semantic memory listing failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_delete_episodic_memory(
        self,
        user_id: str = "default_user",
        memory_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete a completed-turn interaction memory entry."""
        if not memory_id:
            return {"success": False, "error": "memory_id is required"}

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
                },
            }
        except Exception as e:
            logger.error(f"Episodic memory deletion failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_delete_semantic_memory(
        self,
        user_id: str = "default_user",
        memory_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete a semantic memory entry."""
        if not memory_id:
            return {"success": False, "error": "memory_id is required"}

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
                },
            }
        except Exception as e:
            logger.error(f"Semantic memory deletion failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_clear_local_memory(
        self,
        user_id: str = "default_user",
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete user-local episodic interaction memory and semantic memory."""
        try:
            result = await self.memory_store.clear_local_memory(user_id=user_id)
            return {
                "success": True,
                "data": result,
            }
        except Exception as e:
            logger.error(f"Local memory clear failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_clear_chat_history(
        self,
        user_id: str = "default_user",
        **kwargs,
    ) -> Dict[str, Any]:
        """Delete user-local transcript chat history while keeping memory."""
        try:
            result = await self.memory_store.clear_chat_history(user_id=user_id)
            return {
                "success": True,
                "data": result,
            }
        except Exception as e:
            logger.error(f"Chat history clear failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_update_conversation_title(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        title: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Manually update a stored conversation title and emit metadata invalidation."""
        normalized_title = (title or "").strip()
        if not conversation_id:
            return {"success": False, "error": "conversation_id is required"}
        if not normalized_title:
            return {"success": False, "error": "title is required"}
        try:
            await upsert_generated_conversation_title(
                db_path=self.memory_store.episodic_db_path,
                user_id=user_id,
                conversation_id=conversation_id,
                title=normalized_title,
            )
            if getattr(self, "_event_sink", None):
                await self._event_sink(
                    {
                        "type": "conversation-title-updated",
                        "payload": {
                            "user_id": user_id,
                            "conversation_id": conversation_id,
                            "title": normalized_title,
                        },
                    }
                )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "title": normalized_title,
                },
            }
        except Exception as e:
            logger.error(f"Conversation title update failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_get_conversation_title_state(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Return durable title state so SDK enrichment can avoid overwrites."""
        if not conversation_id:
            return {"success": False, "error": "conversation_id is required"}
        try:
            state = await get_conversation_title_state(
                db_path=self.memory_store.episodic_db_path,
                user_id=user_id,
                conversation_id=conversation_id,
            )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "title": state.get("title", ""),
                    "source": state.get("source", ""),
                    "is_locked": bool(state.get("is_locked", False)),
                    "has_title": bool((state.get("title") or "").strip()),
                },
            }
        except Exception as e:
            logger.error(f"Conversation title state read failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_store_chat_event(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        event_type: Optional[str] = None,
        role: Optional[str] = None,
        content: str = "",
        timestamp: Optional[str] = None,
        message_index: Optional[int] = None,
        revision_id: Optional[str] = None,
        turn_ref: Optional[str] = None,
        tool_name: Optional[str] = None,
        correlation_id: Optional[str] = None,
        workspace_path: Optional[str] = None,
        workspace_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        attachments: Optional[List[Any]] = None,
        event_payload: Optional[Dict[str, Any]] = None,
        compaction_checkpoint: Optional[Dict[str, Any]] = None,
        producer: Optional[str] = None,
        producer_event_id: Optional[str] = None,
        producer_sequence: Optional[int] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Store one first-class chat event outside memory/vector storage."""
        if not conversation_id:
            return {"success": False, "error": "conversation_id is required"}
        if not event_type:
            return {"success": False, "error": "event_type is required"}
        normalized_event_payload = self._normalize_transcript_structured_payload(
            event_payload
        )
        if normalized_event_payload is None:
            return {"success": False, "error": "event_payload is required"}
        normalized_metadata = (
            self._normalize_transcript_structured_payload(metadata) or {}
        )
        normalized_attachments = self._normalize_attachment_payload(attachments)
        normalized_checkpoint = self._normalize_transcript_structured_payload(
            compaction_checkpoint
        )

        try:
            stored = await self.memory_store.append_chat_event(
                user_id=sanitize_surrogates_in_text(user_id),
                conversation_id=sanitize_surrogates_in_text(conversation_id),
                event_type=sanitize_surrogates_in_text(event_type),
                role=sanitize_surrogates_in_text(role) if role else None,
                content=sanitize_surrogates_in_text(content or ""),
                timestamp=timestamp,
                message_index=message_index,
                revision_id=(
                    sanitize_surrogates_in_text(revision_id) if revision_id else None
                ),
                turn_ref=sanitize_surrogates_in_text(turn_ref) if turn_ref else None,
                tool_name=sanitize_surrogates_in_text(tool_name) if tool_name else None,
                correlation_id=(
                    sanitize_surrogates_in_text(correlation_id)
                    if correlation_id
                    else None
                ),
                workspace_path=(
                    sanitize_surrogates_in_text(workspace_path)
                    if workspace_path
                    else None
                ),
                workspace_name=(
                    sanitize_surrogates_in_text(workspace_name)
                    if workspace_name
                    else None
                ),
                metadata=normalized_metadata,
                attachments=normalized_attachments,
                event_payload=normalized_event_payload,
                compaction_checkpoint=normalized_checkpoint,
                producer=sanitize_surrogates_in_text(producer) if producer else None,
                producer_event_id=(
                    sanitize_surrogates_in_text(producer_event_id)
                    if producer_event_id
                    else None
                ),
                producer_sequence=producer_sequence,
            )
            return {
                "success": True,
                "data": {
                    **stored,
                    "record_kind": "chat_event",
                },
            }
        except Exception as e:
            logger.error(f"Chat event store failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def _normalize_chat_event_write(
        self,
        event: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        event_payload = self._normalize_transcript_structured_payload(
            event.get("event_payload", event.get("eventPayload"))
        )
        if event_payload is None:
            return None
        metadata = (
            self._normalize_transcript_structured_payload(event.get("metadata")) or {}
        )
        checkpoint = self._normalize_transcript_structured_payload(
            event.get("compaction_checkpoint", event.get("compactionCheckpoint"))
        )
        return {
            "event_type": sanitize_surrogates_in_text(
                event.get("event_type", event.get("eventType")) or ""
            ),
            "role": (
                sanitize_surrogates_in_text(event.get("role"))
                if event.get("role")
                else None
            ),
            "content": sanitize_surrogates_in_text(event.get("content") or ""),
            "timestamp": event.get("timestamp"),
            "message_index": event.get("message_index", event.get("messageIndex")),
            "revision_id": (
                sanitize_surrogates_in_text(
                    event.get("revision_id", event.get("revisionId"))
                )
                if event.get("revision_id", event.get("revisionId"))
                else None
            ),
            "turn_ref": (
                sanitize_surrogates_in_text(event.get("turn_ref", event.get("turnRef")))
                if event.get("turn_ref", event.get("turnRef"))
                else None
            ),
            "tool_name": (
                sanitize_surrogates_in_text(
                    event.get("tool_name", event.get("toolName"))
                )
                if event.get("tool_name", event.get("toolName"))
                else None
            ),
            "correlation_id": (
                sanitize_surrogates_in_text(
                    event.get("correlation_id", event.get("correlationId"))
                )
                if event.get("correlation_id", event.get("correlationId"))
                else None
            ),
            "workspace_path": (
                sanitize_surrogates_in_text(
                    event.get("workspace_path", event.get("workspacePath"))
                )
                if event.get("workspace_path", event.get("workspacePath"))
                else None
            ),
            "workspace_name": (
                sanitize_surrogates_in_text(
                    event.get("workspace_name", event.get("workspaceName"))
                )
                if event.get("workspace_name", event.get("workspaceName"))
                else None
            ),
            "producer": (
                sanitize_surrogates_in_text(event.get("producer"))
                if event.get("producer")
                else None
            ),
            "producer_event_id": (
                sanitize_surrogates_in_text(
                    event.get("producer_event_id", event.get("producerEventId"))
                )
                if event.get("producer_event_id", event.get("producerEventId"))
                else None
            ),
            "producer_sequence": event.get(
                "producer_sequence",
                event.get("producerSequence"),
            ),
            "metadata": metadata,
            "attachments": self._normalize_attachment_payload(event.get("attachments")),
            "event_payload": event_payload,
            "compaction_checkpoint": checkpoint,
        }

    @requires_memory_store
    async def _handle_replace_chat_conversation(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        events: Optional[List[Dict[str, Any]]] = None,
        revision_id: Optional[str] = None,
        revision_updated_at: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        if not conversation_id:
            return {"success": False, "error": "conversation_id is required"}
        if not isinstance(events, list):
            return {"success": False, "error": "events is required"}
        normalized_events: List[Dict[str, Any]] = []
        for event in events:
            if not isinstance(event, dict):
                return {"success": False, "error": "events must contain objects"}
            normalized_event = self._normalize_chat_event_write(event)
            if normalized_event is None or not normalized_event["event_type"]:
                return {
                    "success": False,
                    "error": "each event requires event_type and event_payload",
                }
            normalized_events.append(normalized_event)

        try:
            result = await self.memory_store.replace_chat_conversation(
                user_id=sanitize_surrogates_in_text(user_id),
                conversation_id=sanitize_surrogates_in_text(conversation_id),
                events=normalized_events,
                revision_id=(
                    sanitize_surrogates_in_text(revision_id) if revision_id else None
                ),
                revision_updated_at=(
                    sanitize_surrogates_in_text(revision_updated_at)
                    if revision_updated_at
                    else None
                ),
            )
            return {
                "success": True,
                "data": {
                    **result,
                    "conversation_id": conversation_id,
                    "record_kind": "chat_event",
                },
            }
        except Exception as e:
            logger.error(f"Chat conversation replace failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_rewrite_chat_conversation_after_event(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        cut_after_event_id: Optional[str] = None,
        event: Optional[Dict[str, Any]] = None,
        revision_id: Optional[str] = None,
        revision_updated_at: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        if not conversation_id:
            return {"success": False, "error": "conversation_id is required"}
        if not isinstance(event, dict):
            return {"success": False, "error": "event is required"}
        normalized_event = self._normalize_chat_event_write(event)
        if normalized_event is None or not normalized_event["event_type"]:
            return {
                "success": False,
                "error": "event requires event_type and event_payload",
            }

        try:
            result = await self.memory_store.rewrite_chat_conversation_after_event(
                user_id=sanitize_surrogates_in_text(user_id),
                conversation_id=sanitize_surrogates_in_text(conversation_id),
                cut_after_event_id=(
                    sanitize_surrogates_in_text(cut_after_event_id)
                    if cut_after_event_id
                    else None
                ),
                event=normalized_event,
                revision_id=(
                    sanitize_surrogates_in_text(revision_id) if revision_id else None
                ),
                revision_updated_at=(
                    sanitize_surrogates_in_text(revision_updated_at)
                    if revision_updated_at
                    else None
                ),
            )
            return {
                "success": True,
                "data": {
                    **result,
                    "conversation_id": conversation_id,
                    "record_kind": "chat_event",
                },
            }
        except Exception as e:
            logger.error(f"Chat conversation cutoff rewrite failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_get_chat_conversation_revision(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        if not conversation_id:
            return {"success": False, "error": "conversation_id is required"}
        try:
            revision = await self.memory_store.get_chat_conversation_revision(
                user_id=sanitize_surrogates_in_text(user_id),
                conversation_id=sanitize_surrogates_in_text(conversation_id),
            )
            return {
                "success": True,
                "data": revision
                or {
                    "conversation_id": conversation_id,
                    "revision_id": f"rev-stored-{conversation_id}",
                    "updated_at": "1970-01-01T00:00:00+00:00",
                    "record_kind": "chat_event",
                },
            }
        except Exception as e:
            logger.error(
                f"Chat conversation revision lookup failed: {e}", exc_info=True
            )
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_list_chat_conversations(
        self,
        user_id: str = "default_user",
        limit: Optional[int] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        try:
            conversations = await self.memory_store.list_chat_conversations(
                user_id=user_id,
                limit=limit,
            )
            return {
                "success": True,
                "data": {
                    "conversations": conversations,
                    "count": len(conversations),
                },
            }
        except Exception as e:
            logger.error(f"Chat conversation listing failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_search_chat_conversations(
        self,
        query: str,
        user_id: str = "default_user",
        limit: int = 40,
        **kwargs,
    ) -> Dict[str, Any]:
        try:
            conversations = await self.memory_store.search_chat_conversations(
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
                },
            }
        except Exception as e:
            logger.error(f"Chat conversation search failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_get_chat_events(
        self,
        conversation_id: Optional[str] = None,
        user_id: str = "default_user",
        limit: int = 1000,
        after_message_index: Optional[int] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        try:
            events = await self.memory_store.get_chat_events(
                user_id=user_id,
                conversation_id=conversation_id,
                limit=limit,
                after_message_index=after_message_index,
            )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "events": events,
                    "count": len(events),
                },
            }
        except Exception as e:
            logger.error(f"Chat event fetch failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_delete_chat_conversation(
        self,
        user_id: str = "default_user",
        conversation_id: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        try:
            deleted_count = await self.memory_store.delete_chat_conversation(
                user_id=user_id,
                conversation_id=conversation_id,
            )
            return {
                "success": True,
                "data": {
                    "conversation_id": conversation_id,
                    "record_kind": "chat_event",
                    "deleted_count": deleted_count,
                },
            }
        except Exception as e:
            logger.error(f"Chat conversation deletion failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    @requires_memory_store
    async def _handle_store_memory_by_embedding(
        self,
        content: str,
        embedding,
        embedding_space_version: Optional[str] = None,
        memory_type: str = "episodic",
        user_id: str = "default_user",
        conversation_id: str = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Store SDK-formatted memory using an SDK-provided embedding."""
        try:
            surrogate_paths = find_surrogate_paths(
                {
                    "content": content,
                    "memory_type": memory_type,
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                },
                root="store_memory_by_embedding",
            )
            if surrogate_paths:
                logger.warning(
                    "Lone surrogate detected in memory payload fields: %s",
                    ", ".join(surrogate_paths),
                )
            stored, error = await normalize_and_store_memory_by_embedding(
                self.memory_store,
                content=content,
                embedding=embedding,
                embedding_space_version=embedding_space_version,
                memory_type=memory_type,
                user_id=user_id,
                conversation_id=conversation_id,
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
            return {"success": False, "error": str(e)}
