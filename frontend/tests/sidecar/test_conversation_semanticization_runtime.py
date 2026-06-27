"""Covers local-runtime conversation semanticization behavior."""

import json
from pathlib import Path
from typing import Any

import aiosqlite
import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory import conversation_semanticization_runtime as runtime  # noqa: E402
from memory.sqlite_store import init_episodic_schema  # noqa: E402
from memory.sqlite_store import init_semantic_schema  # noqa: E402


async def _insert_episodic_memory(db_path: Path, **payload: Any) -> None:
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            INSERT INTO memories (
                id,
                user_id,
                content,
                timestamp,
                metadata,
                conversation_id,
                record_kind,
                role,
                message_index,
                message_type,
                tool_name,
                is_semanticized
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                payload["id"],
                payload["user_id"],
                payload.get("content", "content"),
                payload["timestamp"],
                payload.get("metadata", "{}"),
                payload.get("conversation_id"),
                payload.get("record_kind"),
                payload.get("role"),
                payload.get("message_index"),
                payload.get("message_type"),
                payload.get("tool_name"),
                payload.get("is_semanticized", 0),
            ),
        )
        await conn.commit()


async def _insert_semantic_memory(db_path: Path, **payload: Any) -> None:
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            """
            INSERT INTO memories (
                id,
                user_id,
                content,
                timestamp,
                metadata
            )
            VALUES (?, ?, ?, ?, ?)
        """,
            (
                payload["id"],
                payload["user_id"],
                payload.get("content", "semantic content"),
                payload["timestamp"],
                payload.get("metadata", "{}"),
            ),
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_unsemanticized_user_discovery_and_count_respect_interaction_scope(
    tmp_path: Path,
):
    episodic_db_path = tmp_path / "episodic.db"
    await init_episodic_schema(episodic_db_path)

    await _insert_episodic_memory(
        episodic_db_path,
        id="m_old",
        user_id="user-old",
        timestamp="2026-01-01T00:00:00+00:00",
        record_kind="interaction",
        is_semanticized=0,
    )
    await _insert_episodic_memory(
        episodic_db_path,
        id="m_new",
        user_id="user-new",
        timestamp="2026-01-02T00:00:00+00:00",
        record_kind="interaction",
        is_semanticized=0,
    )
    await _insert_episodic_memory(
        episodic_db_path,
        id="m_done",
        user_id="user-done",
        timestamp="2026-01-03T00:00:00+00:00",
        record_kind="interaction",
        is_semanticized=1,
    )
    await _insert_episodic_memory(
        episodic_db_path,
        id="m_non_interaction",
        user_id="user-non-interaction",
        timestamp="2026-01-04T00:00:00+00:00",
        record_kind="memory",
        is_semanticized=0,
    )

    user_ids = await runtime.get_user_ids_with_unsemanticized_memories(
        episodic_db_path=str(episodic_db_path),
        limit=10,
    )
    total_count = await runtime.count_unsemanticized_interaction_memories(
        episodic_db_path=str(episodic_db_path),
    )
    new_user_count = await runtime.count_unsemanticized_interaction_memories(
        episodic_db_path=str(episodic_db_path),
        user_id="user-new",
    )

    assert user_ids == ["user-new", "user-old"]
    assert total_count == 2
    assert new_user_count == 1


@pytest.mark.asyncio
async def test_semantic_summary_exists_matches_summary_hash_metadata(tmp_path: Path):
    semantic_db_path = tmp_path / "semantic.db"
    await init_semantic_schema(semantic_db_path)

    await _insert_semantic_memory(
        semantic_db_path,
        id="s1",
        user_id="user-1",
        timestamp="2026-01-05T00:00:00+00:00",
        metadata=json.dumps(
            {"summary_hash": "hash-123", "source": "periodic_summarization"}
        ),
    )

    assert (
        await runtime.semantic_summary_exists(
            semantic_db_path=str(semantic_db_path),
            summary_hash="",
        )
        is False
    )
    assert (
        await runtime.semantic_summary_exists(
            semantic_db_path=str(semantic_db_path),
            summary_hash="missing",
        )
        is False
    )
    assert (
        await runtime.semantic_summary_exists(
            semantic_db_path=str(semantic_db_path),
            summary_hash="hash-123",
        )
        is True
    )
