"""Covers local-runtime conversation window behavior."""

import json
from pathlib import Path
from typing import Any, Dict, List

import aiosqlite
import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory import conversation_window_runtime as runtime  # noqa: E402
from memory.sqlite_store import init_episodic_schema  # noqa: E402


async def _insert_memory(db_path: Path, **payload: Any) -> None:
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
                payload["content"],
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


def test_conversation_where_clause_handles_null_and_value():
    assert runtime.conversation_where_clause(None) == ("conversation_id IS NULL", ())
    assert runtime.conversation_where_clause("conv_1") == (
        "conversation_id = ?",
        ("conv_1",),
    )


def test_format_transcript_rows_maps_metadata_and_optional_conversation_id():
    rows = [
        {
            "id": "m1",
            "content": "hello",
            "timestamp": "2026-01-01T00:00:00+00:00",
            "metadata": json.dumps({"record_kind": "interaction", "role": "assistant"}),
            "record_kind": None,
            "role": None,
            "message_type": "llm-text",
            "tool_name": None,
            "conversation_id": "conv_1",
        }
    ]

    without_conversation = runtime.format_transcript_rows(
        rows=rows,
        include_conversation_id=False,
        parse_raw_metadata=lambda raw: json.loads(raw),
    )
    with_conversation = runtime.format_transcript_rows(
        rows=rows,
        include_conversation_id=True,
        parse_raw_metadata=lambda raw: json.loads(raw),
    )

    assert without_conversation[0]["record_kind"] == "interaction"
    assert without_conversation[0]["role"] == "assistant"
    assert "conversation_id" not in without_conversation[0]
    assert with_conversation[0]["conversation_id"] == "conv_1"


@pytest.mark.asyncio
async def test_unsemanticized_window_helpers_return_sorted_windows_and_formatted_rows(
    tmp_path: Path,
):
    db_path = tmp_path / "episodic.db"
    await init_episodic_schema(db_path)

    await _insert_memory(
        db_path,
        id="i1",
        user_id="user-1",
        content="older",
        timestamp="2026-02-01T00:00:00+00:00",
        metadata="{}",
        conversation_id="conv_old",
        record_kind="interaction",
        role="assistant",
        message_index=1,
        message_type="tool-result",
        tool_name="tool_old",
        is_semanticized=0,
    )
    await _insert_memory(
        db_path,
        id="i2",
        user_id="user-1",
        content="newer",
        timestamp="2026-02-02T00:00:00+00:00",
        metadata="{}",
        conversation_id="conv_new",
        record_kind="interaction",
        role="assistant",
        message_index=1,
        message_type="tool-result",
        tool_name="tool_new",
        is_semanticized=0,
    )

    windows = await runtime.get_unsemanticized_conversation_windows(
        episodic_db_path=str(db_path),
        user_id="user-1",
    )
    assert windows == ["conv_old", "conv_new"]

    def _format_rows(rows: List[Any], include_conversation_id: bool):
        assert include_conversation_id is True
        return [
            {"id": row["id"], "conversation_id": row["conversation_id"]} for row in rows
        ]

    rows = await runtime.get_unsemanticized_episodic_memories_by_conversation(
        episodic_db_path=str(db_path),
        user_id="user-1",
        conversation_id="conv_old",
        limit=10,
        format_transcript_rows=_format_rows,
    )

    assert rows == [{"id": "i1", "conversation_id": "conv_old"}]


@pytest.mark.asyncio
async def test_unsemanticized_helpers_mark_and_watermark_cursor_paths(tmp_path: Path):
    db_path = tmp_path / "episodic.db"
    await init_episodic_schema(db_path)

    rows_to_insert = [
        {
            "id": "m1",
            "user_id": "user-1",
            "content": "first",
            "timestamp": "2026-01-01T00:00:00+00:00",
            "metadata": json.dumps({"record_kind": "interaction", "role": "user"}),
            "conversation_id": "conv-1",
            "record_kind": "interaction",
            "role": "user",
            "message_index": 1,
            "message_type": "llm-text",
            "tool_name": None,
            "is_semanticized": 0,
        },
        {
            "id": "m2",
            "user_id": "user-1",
            "content": "second",
            "timestamp": "2026-01-02T00:00:00+00:00",
            "metadata": json.dumps({"record_kind": "interaction", "role": "assistant"}),
            "conversation_id": "conv-1",
            "record_kind": "interaction",
            "role": "assistant",
            "message_index": 2,
            "message_type": "llm-text",
            "tool_name": None,
            "is_semanticized": 0,
        },
        {
            "id": "m3",
            "user_id": "user-1",
            "content": "same timestamp after watermark",
            "timestamp": "2026-01-02T00:00:00+00:00",
            "metadata": json.dumps({"record_kind": "interaction", "role": "assistant"}),
            "conversation_id": "conv-1",
            "record_kind": "interaction",
            "role": "assistant",
            "message_index": 3,
            "message_type": "llm-text",
            "tool_name": None,
            "is_semanticized": 0,
        },
    ]
    for payload in rows_to_insert:
        await _insert_memory(db_path, **payload)

    debug_calls: List[str] = []
    await runtime.mark_episodic_memories_semanticized(
        episodic_db_path=str(db_path),
        memory_ids=["m1"],
        log_debug=lambda message, count: debug_calls.append(message % count),
    )

    unsemanticized = await runtime.get_unsemanticized_episodic_memories(
        episodic_db_path=str(db_path),
        user_id="user-1",
        limit=10,
        format_transcript_rows=lambda rows, include_conversation_id: runtime.format_transcript_rows(
            rows=rows,
            include_conversation_id=include_conversation_id,
            parse_raw_metadata=lambda raw: json.loads(raw),
        ),
    )
    after_existing_watermark = await runtime.get_unprocessed_memories_after_id(
        episodic_db_path=str(db_path),
        last_id="m2",
        user_id="user-1",
        limit=100,
        format_transcript_rows=lambda rows, include_conversation_id: runtime.format_transcript_rows(
            rows=rows,
            include_conversation_id=include_conversation_id,
            parse_raw_metadata=lambda raw: json.loads(raw),
        ),
    )
    all_after_missing_watermark = await runtime.get_unprocessed_memories_after_id(
        episodic_db_path=str(db_path),
        last_id="missing-watermark",
        user_id="user-1",
        limit=100,
        format_transcript_rows=lambda rows, include_conversation_id: runtime.format_transcript_rows(
            rows=rows,
            include_conversation_id=include_conversation_id,
            parse_raw_metadata=lambda raw: json.loads(raw),
        ),
    )

    assert debug_calls == ["Marked 1 episodic memories as semanticized"]
    assert [row["id"] for row in unsemanticized] == ["m2", "m3"]
    assert [row["id"] for row in after_existing_watermark] == ["m3"]
    assert [row["id"] for row in all_after_missing_watermark] == ["m2", "m3"]


@pytest.mark.asyncio
async def test_mark_episodic_memories_semanticized_merges_metadata_patch(
    tmp_path: Path,
):
    db_path = tmp_path / "episodic.db"
    await init_episodic_schema(db_path)

    await _insert_memory(
        db_path,
        id="m1",
        user_id="user-1",
        content="first",
        timestamp="2026-01-01T00:00:00+00:00",
        metadata=json.dumps({"source": "interaction_completed"}),
        conversation_id="conv-1",
        record_kind="interaction",
        role="user",
        message_index=1,
        message_type="llm-text",
        tool_name=None,
        is_semanticized=0,
    )

    await runtime.mark_episodic_memories_semanticized(
        episodic_db_path=str(db_path),
        memory_ids=["m1"],
        metadata_patch={
            "semantic_status": "skipped_low_signal",
            "semantic_skip_reason": "low_signal",
        },
    )

    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.cursor()
        await cursor.execute(
            "SELECT is_semanticized, metadata FROM memories WHERE id = ?",
            ("m1",),
        )
        row = await cursor.fetchone()

    assert row["is_semanticized"] == 1
    metadata = json.loads(row["metadata"])
    assert metadata["source"] == "interaction_completed"
    assert metadata["semantic_status"] == "skipped_low_signal"
    assert metadata["semantic_skip_reason"] == "low_signal"
