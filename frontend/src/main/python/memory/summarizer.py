"""
Periodic memory summarizer.

Converts episodic memories into semantic memories in the background.
"""

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set

from core.remote_semantic_client import RemoteSemanticClient
from memory.local_store import LocalMemoryStore
from memory.operations import (
    SEMANTIC_STATUS_STORED,
    build_semanticization_metadata,
    classify_semantic_summarization_result,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SummarizerSettings:
    interval_seconds: int = 60
    idle_seconds: int = 120
    min_batch_size: int = 6
    min_batch_size_idle: int = 1
    max_batch_size: int = 30
    min_memory_age_seconds: int = 45
    max_summaries_per_cycle: int = 3
    max_conversations_per_cycle: int = 5
    max_chunk_chars: int = 24000
    max_chunks_per_request: int = 20
    backoff_min_seconds: int = 30
    backoff_max_seconds: int = 600


class MemorySummarizer:
    def __init__(
        self,
        memory_store: LocalMemoryStore,
        semantic_client: Optional[RemoteSemanticClient] = None,
        settings: Optional[SummarizerSettings] = None,
    ) -> None:
        self.memory_store = memory_store
        self.semantic_client = semantic_client or RemoteSemanticClient()
        self.settings = settings or SummarizerSettings()

        self._shutdown_event = asyncio.Event()
        self._wake_event = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._backoff_seconds = 0
        self._last_activity_at: Optional[datetime] = None
        self._known_user_ids: Set[str] = set()

    def notify_new_memory(self, user_id: str) -> None:
        if user_id:
            self._known_user_ids.add(user_id)
        self._last_activity_at = datetime.now(timezone.utc)
        self._wake_event.set()

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        await self.semantic_client.initialize()
        self._wake_event.set()
        self._task = asyncio.create_task(self._run_loop(), name="memory-summarizer")

    async def stop(self) -> None:
        self._shutdown_event.set()
        self._wake_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self.semantic_client.close()

    async def _run_loop(self) -> None:
        try:
            while not self._shutdown_event.is_set():
                await self._wait_interval()
                await self._maybe_summarize()
        except asyncio.CancelledError:
            logger.info("Memory summarizer cancelled")
        except Exception as e:
            logger.error(f"Memory summarizer crashed: {e}", exc_info=True)

    async def _wait_interval(self) -> None:
        wait_seconds = self.settings.interval_seconds
        if self._backoff_seconds:
            wait_seconds = max(wait_seconds, self._backoff_seconds)
        shutdown_task = asyncio.create_task(self._shutdown_event.wait())
        wake_task = asyncio.create_task(self._wake_event.wait())
        try:
            done, pending = await asyncio.wait(
                {shutdown_task, wake_task},
                timeout=wait_seconds,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if wake_task in done:
                self._wake_event.clear()
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
        finally:
            for task in (shutdown_task, wake_task):
                if not task.done():
                    task.cancel()

    async def _maybe_summarize(self) -> None:
        if self._lock.locked():
            return

        async with self._lock:
            try:
                if not await self._should_run():
                    return

                user_ids = await self._get_user_ids_with_work()
                summaries_done = 0

                for user_id in user_ids:
                    if summaries_done >= self.settings.max_summaries_per_cycle:
                        break

                    try:
                        conversation_ids = await self.memory_store.get_unsemanticized_conversation_windows(user_id)
                    except Exception as e:
                        logger.warning(
                            "Failed to load unsemanticized conversation windows "
                            "(user_id=%s): %s",
                            user_id,
                            e,
                        )
                        continue
                    if not conversation_ids:
                        continue

                    for conversation_id in conversation_ids[: self.settings.max_conversations_per_cycle]:
                        if summaries_done >= self.settings.max_summaries_per_cycle:
                            break

                        try:
                            summaries_done += await self._summarize_conversation_batch(
                                user_id=user_id,
                                conversation_id=conversation_id,
                            )
                        except Exception as e:
                            logger.warning(
                                "Failed semantic summarization batch "
                                "(user_id=%s, conversation_id=%s): %s",
                                user_id,
                                conversation_id,
                                e,
                            )
                            continue

                if summaries_done:
                    await self.memory_store.update_watermark(last_semanticized_id=None, pending_message_count=0)

                # Reset backoff after a successful cycle
                self._backoff_seconds = 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Memory summarization cycle failed: {e}", exc_info=True)
                self._apply_backoff()

    async def _should_run(self) -> bool:
        if self._shutdown_event.is_set():
            return False

        try:
            pending = await self.memory_store.count_unsemanticized_interaction_memories()
        except Exception as e:
            logger.warning(
                "Failed to count unsemanticized interaction memories for summarizer gate: %s",
                e,
            )
            return False

        if pending >= self.settings.min_batch_size:
            return True

        return pending >= self.settings.min_batch_size_idle and self._is_idle()

    def _is_idle(self) -> bool:
        if not self._last_activity_at:
            return True
        idle_seconds = (
            datetime.now(timezone.utc) - self._last_activity_at
        ).total_seconds()
        return idle_seconds >= self.settings.idle_seconds

    async def _get_user_ids_with_work(self) -> List[str]:
        ordered_user_ids: List[str] = []
        seen: Set[str] = set()

        for user_id in self._known_user_ids:
            if user_id and user_id not in seen:
                ordered_user_ids.append(user_id)
                seen.add(user_id)

        try:
            discovery_limit = max(self.settings.max_conversations_per_cycle, 1)
            discovered = await self.memory_store.get_user_ids_with_unsemanticized_memories(
                limit=discovery_limit
            )
            for user_id in discovered:
                if user_id and user_id not in seen:
                    ordered_user_ids.append(user_id)
                    seen.add(user_id)
        except Exception as e:
            logger.warning(f"Failed to discover user IDs for summarization: {e}")
        return ordered_user_ids

    async def _summarize_conversation_batch(
        self,
        user_id: str,
        conversation_id: Optional[str],
    ) -> int:
        if not user_id or user_id == "default_user":
            logger.debug("Skipping summarization for invalid user_id")
            return 0

        memories = await self.memory_store.get_unsemanticized_episodic_memories_by_conversation(
            user_id=user_id,
            conversation_id=conversation_id,
            limit=self.settings.max_batch_size,
        )
        if not memories:
            return 0

        if not self._should_summarize_batch(memories):
            return 0

        summary_hash = self._build_summary_hash(user_id, conversation_id, memories)
        if await self.memory_store.semantic_summary_exists(summary_hash):
            await self._mark_semanticized(memories)
            return 1

        conversation_chunks = self._build_conversation_chunks(memories)
        if not conversation_chunks:
            return 0

        summary, facts = await self.semantic_client.summarize(conversation_chunks, user_id)
        result = classify_semantic_summarization_result(summary, facts)
        summary = result["summary"]
        facts = result["facts"]
        durable_facts = result["durable_facts"]
        semantic_status = result["status"]

        if not durable_facts:
            logger.info(
                "Skipping semantic memory write for %s batch "
                "(user_id=%s, conversation_id=%s, source_memory_count=%s)",
                semantic_status,
                user_id,
                conversation_id,
                len(memories),
            )
            await self._mark_semanticized(
                memories,
                metadata_patch=build_semanticization_metadata(
                    status=semantic_status,
                    summary_hash=summary_hash,
                    skipped_fact_count=len(facts),
                ),
            )
            return 1

        semantic_content = self._format_semantic_content(summary, durable_facts)
        metadata = {
            "type": "semantic",
            "source": "periodic_summarization",
            "summary_hash": summary_hash,
            "source_conversation_id": conversation_id,
            "source_memory_ids": [m["id"] for m in memories],
            "source_memory_count": len(memories),
            "summary_created_at": datetime.now(timezone.utc).isoformat(),
            "durable_fact_count": len(durable_facts),
            "semantic_categories": self._categorize_facts(durable_facts),
        }

        await self.memory_store.add(
            semantic_content,
            user_id,
            metadata,
            conversation_id=conversation_id,
        )

        await self._mark_semanticized(
            memories,
            metadata_patch=build_semanticization_metadata(
                status=SEMANTIC_STATUS_STORED,
                summary_hash=summary_hash,
                durable_fact_count=len(durable_facts),
            ),
        )

        return 1

    def _should_summarize_batch(self, memories: Sequence[dict]) -> bool:
        if len(memories) >= self.settings.min_batch_size:
            return True

        if len(memories) < self.settings.min_batch_size_idle:
            return False

        last_ts = self._parse_timestamp(memories[-1].get("timestamp"))
        if not last_ts:
            return self._is_idle()

        age_seconds = (datetime.now(timezone.utc) - last_ts).total_seconds()
        if age_seconds < self.settings.min_memory_age_seconds:
            return False

        return age_seconds >= self.settings.idle_seconds

    def _build_summary_hash(
        self,
        user_id: str,
        conversation_id: Optional[str],
        memories: Sequence[dict],
    ) -> str:
        payload = {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "memory_ids": [m.get("id") for m in memories],
        }
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _build_conversation_chunks(self, memories: Sequence[dict]) -> List[str]:
        lines: List[str] = []
        for memory in memories:
            line = self._format_memory_line(memory)
            if not line:
                continue
            lines.append(line)

        if not lines:
            return []

        chunks: List[str] = []
        current = ""
        for line in lines:
            if len(line) > self.settings.max_chunk_chars:
                line = line[: self.settings.max_chunk_chars - 3] + "..."
            if not current:
                current = line
                continue
            if len(current) + len(line) + 1 > self.settings.max_chunk_chars:
                chunks.append(current)
                current = line
                if len(chunks) >= self.settings.max_chunks_per_request:
                    break
            else:
                current = f"{current}\n{line}"

        if current and len(chunks) < self.settings.max_chunks_per_request:
            chunks.append(current)

        return chunks

    def _format_memory_line(self, memory: dict) -> Optional[str]:
        """Normalize episodic rows into stable summarization lines."""
        content = (memory.get("content") or "").strip()
        if not content:
            return None

        role = (memory.get("role") or memory.get("metadata", {}).get("role") or "").strip().lower()
        message_type = (
            memory.get("message_type")
            or memory.get("metadata", {}).get("message_type")
            or ""
        ).strip().lower()
        record_kind = (
            memory.get("record_kind")
            or memory.get("metadata", {}).get("record_kind")
            or "memory"
        ).strip().lower()
        tool_name = (memory.get("tool_name") or memory.get("metadata", {}).get("tool_name") or "").strip()

        if self._is_filtered_tool_transcript_entry(record_kind, role, message_type):
            return None

        if len(content) > 1600:
            content = content[:1597] + "..."

        timestamp = memory.get("timestamp") or ""
        prefix_parts = [part for part in (role or None, message_type or None, tool_name or None) if part]
        prefix = "|".join(prefix_parts) if prefix_parts else record_kind
        return f"[{timestamp}] ({prefix}) {content}"

    @staticmethod
    def _is_filtered_tool_transcript_entry(
        record_kind: str,
        role: str,
        message_type: str,
    ) -> bool:
        if record_kind != "transcript":
            return False

        # Tool role rows are tool execution chatter (calls/outputs/results).
        if role == "tool":
            return True

        # Defensive filtering for older or alternate transcript encodings.
        return message_type in {
            "tool-call",
            "tool-bundle",
            "tool-output",
            "tool-result",
            "tool-bundle-output",
            "tool-bundle-result",
        }

    def _format_semantic_content(self, summary: str, facts: Sequence[str]) -> str:
        parts = []
        if summary:
            parts.append(f"Summary: {summary}")
        if facts:
            parts.append("Facts:")
            parts.extend([f"- {fact}" for fact in facts])
        return "\n".join(parts).strip()

    @staticmethod
    def _categorize_facts(facts: Sequence[str]) -> List[str]:
        categories: Set[str] = set()
        for fact in facts:
            lowered = fact.lower()
            if any(token in lowered for token in ("prefer", "preference", "likes", "dislikes", "wants")):
                categories.add("preference")
            if any(token in lowered for token in ("workflow", "uses", "runs", "connects", "manages")):
                categories.add("workflow")
            if any(token in lowered for token in ("project", "working on", "building", "learning", "focused on")):
                categories.add("project")
            if any(token in lowered for token in ("name is", "email", "works as", "account")):
                categories.add("identity")
            if any(token in lowered for token in ("must", "needs", "constraint", "cannot", "should")):
                categories.add("constraint")
        return sorted(categories)

    async def _mark_semanticized(
        self,
        memories: Sequence[dict],
        metadata_patch: Optional[Dict[str, Any]] = None,
    ) -> None:
        memory_ids = [m.get("id") for m in memories if m.get("id")]
        await self.memory_store.mark_episodic_memories_semanticized(
            memory_ids,
            metadata_patch=metadata_patch,
        )

    def _parse_timestamp(self, timestamp: Optional[str]) -> Optional[datetime]:
        if not timestamp:
            return None
        try:
            if timestamp.endswith("Z"):
                timestamp = timestamp.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(timestamp)
            if parsed.tzinfo is None:
                local_tz = datetime.now().astimezone().tzinfo or timezone.utc
                parsed = parsed.replace(tzinfo=local_tz)
            return parsed.astimezone(timezone.utc)
        except Exception:
            return None

    def _apply_backoff(self) -> None:
        if self._backoff_seconds == 0:
            self._backoff_seconds = self.settings.backoff_min_seconds
        else:
            self._backoff_seconds = min(
                self._backoff_seconds * 2, self.settings.backoff_max_seconds
            )
