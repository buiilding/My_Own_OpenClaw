"""
Shared conversation-title background runtime helpers for LocalMemoryStore.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Optional

try:
    import aiosqlite
except ImportError:
    aiosqlite = None

from memory.conversation_title_helpers import fetch_title_generation_inputs
from memory.conversation_title_helpers import lookup_conversation_title_state
from memory.conversation_title_helpers import normalize_generated_title


class NoopTitleClient:
    async def initialize(self) -> None:
        return None

    async def close(self) -> None:
        return None

    async def generate_title(self, **_kwargs) -> str:
        return ""


def ensure_title_generation_runtime_state(*, store) -> None:
    if not hasattr(store, "title_client") or store.title_client is None:
        # Test harnesses that instantiate via __new__ can omit title wiring.
        store.title_client = NoopTitleClient()
    if not hasattr(store, "_title_generation_tasks") or store._title_generation_tasks is None:
        store._title_generation_tasks = {}
    if (
        not hasattr(store, "_title_generation_semaphore")
        or store._title_generation_semaphore is None
    ):
        store._title_generation_semaphore = asyncio.Semaphore(2)


async def maybe_generate_conversation_title(
    *,
    store,
    user_id: str,
    conversation_id: str,
    preferred_model_id: Optional[str],
    preferred_model_provider: Optional[str],
    logger,
) -> None:
    if not conversation_id:
        return
    ensure_title_generation_runtime_state(store=store)
    task_key = (user_id, conversation_id)
    existing_task = store._title_generation_tasks.get(task_key)
    if existing_task and not existing_task.done():
        return

    task = asyncio.create_task(
        run_conversation_title_generation(
            store=store,
            user_id=user_id,
            conversation_id=conversation_id,
            preferred_model_id=preferred_model_id,
            preferred_model_provider=preferred_model_provider,
            logger=logger,
        ),
        name=f"title-gen:{user_id}:{conversation_id}",
    )
    store._title_generation_tasks[task_key] = task

    def _cleanup(done_task: asyncio.Task[Any]) -> None:
        current = store._title_generation_tasks.get(task_key)
        if current is done_task:
            store._title_generation_tasks.pop(task_key, None)

    task.add_done_callback(_cleanup)


async def cancel_title_generation_tasks(*, store) -> None:
    ensure_title_generation_runtime_state(store=store)
    pending_tasks = [
        task
        for task in store._title_generation_tasks.values()
        if task and not task.done()
    ]
    if not pending_tasks:
        store._title_generation_tasks.clear()
        return
    for task in pending_tasks:
        task.cancel()
    await asyncio.gather(*pending_tasks, return_exceptions=True)
    store._title_generation_tasks.clear()


async def run_conversation_title_generation(
    *,
    store,
    user_id: str,
    conversation_id: str,
    preferred_model_id: Optional[str],
    preferred_model_provider: Optional[str],
    logger,
) -> None:
    ensure_title_generation_runtime_state(store=store)
    try:
        async with store._title_generation_semaphore:
            await generate_conversation_title_and_persist(
                store=store,
                user_id=user_id,
                conversation_id=conversation_id,
                preferred_model_id=preferred_model_id,
                preferred_model_provider=preferred_model_provider,
            )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning(
            "Failed to generate conversation title (user_id=%s conversation_id=%s): %s",
            user_id,
            conversation_id,
            exc,
        )


async def generate_conversation_title_and_persist(
    *,
    store,
    user_id: str,
    conversation_id: str,
    preferred_model_id: Optional[str],
    preferred_model_provider: Optional[str],
) -> None:
    if aiosqlite is None:
        raise ImportError("aiosqlite is not installed. Install with: pip install aiosqlite")

    async with aiosqlite.connect(store.episodic_db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()

        current_title, _, is_locked = await lookup_conversation_title_state(
            cursor=cursor,
            user_id=user_id,
            conversation_id=conversation_id,
        )
        if current_title or is_locked:
            return

        first_user_content, first_assistant_content, assistant_model_id, assistant_model_provider = (
            await fetch_title_generation_inputs(
                cursor=cursor,
                user_id=user_id,
                conversation_id=conversation_id,
                preferred_model_id=preferred_model_id,
                preferred_model_provider=preferred_model_provider,
            )
        )
        if not first_user_content or not first_assistant_content:
            return

        selected_model_id = (
            preferred_model_id.strip()
            if isinstance(preferred_model_id, str) and preferred_model_id.strip()
            else assistant_model_id
        )
        selected_model_provider = (
            preferred_model_provider.strip()
            if isinstance(preferred_model_provider, str) and preferred_model_provider.strip()
            else assistant_model_provider
        )

        generated_title = await store.title_client.generate_title(
            user_id=user_id,
            user_message=first_user_content,
            assistant_message=first_assistant_content,
            model_id=selected_model_id,
            model_provider=selected_model_provider,
        )
        normalized_title = normalize_generated_title(generated_title)
        if not normalized_title:
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        await cursor.execute(
            """
            INSERT INTO conversation_titles (
                user_id,
                conversation_id,
                title,
                source,
                is_locked,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(user_id, conversation_id)
            DO UPDATE SET
                title = excluded.title,
                source = excluded.source,
                updated_at = excluded.updated_at
            WHERE conversation_titles.is_locked = 0
        """,
            (
                user_id,
                conversation_id,
                normalized_title,
                "model",
                now_iso,
                now_iso,
            ),
        )
        await conn.commit()
