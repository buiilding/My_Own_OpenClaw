from pathlib import Path
from typing import Any, Dict, List, Tuple

import aiosqlite
import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory import conversation_list_runtime as runtime  # noqa: E402
from memory.sqlite_store import init_episodic_schema  # noqa: E402


class _FetchCursor:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.rows = rows
        self.last_query = ""
        self.last_params: Tuple[Any, ...] = ()

    async def execute(self, query: str, params: Tuple[Any, ...]) -> None:
        self.last_query = query
        self.last_params = params

    async def fetchall(self) -> List[Dict[str, Any]]:
        return self.rows


async def _insert_transcript_memory(db_path: Path, **payload: Any) -> None:
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
                model_id,
                model_provider
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                payload["id"],
                payload["user_id"],
                payload["content"],
                payload["timestamp"],
                payload.get("metadata", "{}"),
                payload["conversation_id"],
                "transcript",
                payload.get("role", "user"),
                payload.get("message_index", 1),
                payload.get("message_type", "llm-text"),
                payload.get("model_id"),
                payload.get("model_provider"),
            ),
        )
        await conn.commit()


async def _insert_conversation_title(db_path: Path, **payload: Any) -> None:
    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
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
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            (
                payload["user_id"],
                payload["conversation_id"],
                payload["title"],
                payload.get("source", "heuristic"),
                payload.get("is_locked", 0),
                payload.get("created_at", "2026-02-01T00:00:00+00:00"),
                payload.get("updated_at", "2026-02-01T00:00:00+00:00"),
            ),
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_fetch_transcript_conversation_rows_uses_transcript_scope_and_order():
    cursor = _FetchCursor(rows=[{"conversation_id": "conv_1"}])

    rows = await runtime.fetch_transcript_conversation_rows(
        cursor=cursor,
        user_id="user-1",
        limit=25,
    )

    assert rows == [{"conversation_id": "conv_1"}]
    assert "WHERE user_id = ? AND record_kind = 'transcript'" in cursor.last_query
    assert "ORDER BY last_timestamp DESC" in cursor.last_query
    assert cursor.last_params == (
        "user-1",
        "user-1",
        "user-1",
        "user-1",
        "user-1",
        "user-1",
        "user-1",
        "user-1",
        25,
    )


@pytest.mark.asyncio
async def test_build_conversation_list_results_filters_blank_titles_and_defaults_source(monkeypatch):
    async def _fake_ensure_conversation_title_from_row(*, cursor, user_id: str, row: Dict[str, Any]):
        _ = (cursor, user_id)
        if row.get("conversation_id") == "conv_visible":
            return "  Visible title  ", None
        return "", "model"

    monkeypatch.setattr(
        runtime, "ensure_conversation_title_from_row", _fake_ensure_conversation_title_from_row
    )

    rows = [
        {
            "conversation_id": "conv_visible",
            "first_timestamp": "2026-02-01T00:00:00+00:00",
            "last_timestamp": "2026-02-01T01:00:00+00:00",
            "entry_count": 3,
            "record_kind": "transcript",
            "title": "db title",
            "title_source": "heuristic",
            "title_locked": 0,
            "model_id": "gpt-5-mini",
            "model_provider": "openai",
            "latest_metadata": '{"workspace_path":"/work/WindieOS","workspace_name":"WindieOS"}',
        },
        {
            "conversation_id": "thread_hidden",
            "first_timestamp": "2026-02-02T00:00:00+00:00",
            "last_timestamp": "2026-02-02T01:00:00+00:00",
            "entry_count": 1,
            "record_kind": "transcript",
            "title": None,
            "title_source": None,
            "title_locked": 0,
            "model_id": "gpt-5-mini",
            "model_provider": "openai",
            "latest_metadata": None,
        },
    ]

    results = await runtime.build_conversation_list_results(
        cursor=object(),
        user_id="user-1",
        rows=rows,
    )

    assert len(results) == 1
    assert results[0]["conversation_id"] == "conv_visible"
    assert results[0]["title"] == "Visible title"
    assert results[0]["title_source"] == "model"
    assert results[0]["workspace_path"] == "/work/WindieOS"
    assert results[0]["workspace_name"] == "WindieOS"
    assert results[0]["is_resumable"] is True


@pytest.mark.asyncio
async def test_list_transcript_conversations_returns_newest_first_with_titles(tmp_path: Path):
    db_path = tmp_path / "episodic.db"
    await init_episodic_schema(db_path)

    await _insert_transcript_memory(
        db_path,
        id="m_old",
        user_id="user-1",
        content="old content",
        timestamp="2026-02-01T00:00:00+00:00",
        conversation_id="conv_old",
        model_id="gpt-5-mini",
        model_provider="openai",
    )
    await _insert_transcript_memory(
        db_path,
        id="m_new",
        user_id="user-1",
        content="new content",
        timestamp="2026-02-02T00:00:00+00:00",
        metadata='{"workspace_path":"/work/WindieOS","workspace_name":"WindieOS"}',
        conversation_id="conv_new",
        model_id="gpt-5",
        model_provider="openai",
    )
    await _insert_conversation_title(
        db_path,
        user_id="user-1",
        conversation_id="conv_old",
        title="Old title",
    )
    await _insert_conversation_title(
        db_path,
        user_id="user-1",
        conversation_id="conv_new",
        title="New title",
    )

    conversations = await runtime.list_transcript_conversations(
        episodic_db_path=str(db_path),
        user_id="user-1",
        limit=10,
    )

    assert [row["conversation_id"] for row in conversations] == ["conv_new", "conv_old"]
    assert conversations[0]["title"] == "New title"
    assert conversations[0]["model_id"] == "gpt-5"
    assert conversations[0]["model_provider"] == "openai"
    assert conversations[0]["workspace_path"] == "/work/WindieOS"
    assert conversations[0]["workspace_name"] == "WindieOS"
