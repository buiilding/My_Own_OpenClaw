import logging
from typing import Any, Dict, List, Tuple

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory import conversation_search_runtime as runtime  # noqa: E402


class _FallbackCursor:
    def __init__(self) -> None:
        self.rows: List[Dict[str, Any]] = []
        self.execute_calls: List[Tuple[str, Tuple[Any, ...]]] = []

    async def execute(self, query: str, params: Tuple[Any, ...]) -> None:
        self.execute_calls.append((query, params))
        if "FROM transcript_fts" in query:
            raise RuntimeError("fts unavailable")
        if "LOWER(content) LIKE ?" in query:
            self.rows = [
                {
                    "memory_id": "m_like_1",
                    "conversation_id": "conv_legal",
                    "role": "assistant",
                    "content": "Lawyer outreach sequence and lead filters",
                    "timestamp": "2026-02-01T00:00:00+00:00",
                },
                {
                    "memory_id": "m_like_2",
                    "conversation_id": "conv_legal",
                    "role": "user",
                    "content": "Need California lawyer leads",
                    "timestamp": "2026-01-31T00:00:00+00:00",
                },
            ]
            return
        raise AssertionError(f"unexpected query: {query}")

    async def fetchall(self) -> List[Dict[str, Any]]:
        return self.rows


class _SummaryCursor:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.rows = rows
        self.last_query = ""
        self.last_params: Tuple[Any, ...] = ()

    async def execute(self, query: str, params: Tuple[Any, ...]) -> None:
        self.last_query = query
        self.last_params = params

    async def fetchall(self) -> List[Dict[str, Any]]:
        return self.rows


@pytest.mark.asyncio
async def test_search_transcript_hits_lexical_falls_back_to_like_on_fts_error():
    cursor = _FallbackCursor()

    hits = await runtime.search_transcript_hits_lexical(
        cursor=cursor,
        user_id="user-1",
        query="lawyer outreach",
        limit=4,
        logger=logging.getLogger(__name__),
    )

    assert len(hits) == 2
    assert all(hit["source"] == "lexical" for hit in hits)
    assert "lawyer" in hits[0]["snippet"].lower()
    assert any("FROM transcript_fts" in query for query, _ in cursor.execute_calls)
    assert any("LOWER(content) LIKE ?" in query for query, _ in cursor.execute_calls)


@pytest.mark.asyncio
async def test_search_transcript_hits_semantic_filters_non_transcript_and_missing_conversation():
    class _FakeStore:
        async def search(self, **_kwargs):
            return [
                {
                    "id": "m_good_1",
                    "text": "microphone input device keeps disappearing",
                    "metadata": {
                        "record_kind": "transcript",
                        "role": "assistant",
                        "conversation_id": "conv_audio",
                    },
                    "score": 0.8,
                    "timestamp": "2026-02-01T00:00:00+00:00",
                },
                {
                    "id": "m_skip_kind",
                    "text": "not transcript row",
                    "metadata": {"record_kind": "interaction", "conversation_id": "conv_audio"},
                    "score": 0.7,
                    "timestamp": "2026-02-01T00:00:01+00:00",
                },
                {
                    "id": "m_skip_conversation",
                    "text": "missing conversation id",
                    "metadata": {"record_kind": "transcript"},
                    "score": 0.6,
                    "timestamp": "2026-02-01T00:00:02+00:00",
                },
                {
                    "id": "m_good_2",
                    "text": "audio stack fallback can recover default input",
                    "metadata": {"record_kind": "transcript", "role": "assistant"},
                    "conversation_id": "conv_audio",
                    "score": 0.55,
                    "timestamp": "2026-02-01T00:00:03+00:00",
                },
            ]

    hits = await runtime.search_transcript_hits_semantic(
        store=_FakeStore(),
        user_id="user-1",
        query="audio input issue",
        limit=10,
        logger=logging.getLogger(__name__),
    )

    assert [hit["memory_id"] for hit in hits] == ["m_good_1", "m_good_2"]
    assert all(hit["source"] == "semantic" for hit in hits)
    assert all(hit["conversation_id"] == "conv_audio" for hit in hits)
    assert all(hit["score"] > 0.0 for hit in hits)


@pytest.mark.asyncio
async def test_fetch_conversation_summaries_assigns_pending_when_title_missing(monkeypatch):
    rows = [
        {
            "conversation_id": "conv_alpha",
            "first_timestamp": "2026-01-01T00:00:00+00:00",
            "last_timestamp": "2026-01-01T01:00:00+00:00",
            "entry_count": 4,
            "title": "alpha from db",
            "title_source": "heuristic",
            "title_locked": 0,
            "model_id": "gpt-5-mini",
            "model_provider": "openai",
        },
        {
            "conversation_id": "thread-beta",
            "first_timestamp": "2026-01-02T00:00:00+00:00",
            "last_timestamp": "2026-01-02T02:00:00+00:00",
            "entry_count": 3,
            "title": None,
            "title_source": None,
            "title_locked": 0,
            "model_id": "gpt-5-mini",
            "model_provider": "openai",
        },
    ]
    cursor = _SummaryCursor(rows)

    async def _fake_ensure_conversation_title_from_row(
        *,
        cursor,
        user_id: str,
        row: Dict[str, Any],
    ):
        _ = (cursor, user_id)
        if row.get("conversation_id") == "thread-beta":
            return None, None
        return "  Alpha title  ", "model"

    monkeypatch.setattr(
        runtime, "ensure_conversation_title_from_row", _fake_ensure_conversation_title_from_row
    )

    summaries = await runtime.fetch_conversation_summaries(
        cursor=cursor,
        user_id="user-1",
        conversation_ids=["conv_alpha", "", None, "thread-beta"],
    )

    assert set(summaries.keys()) == {"conv_alpha", "thread-beta"}
    assert summaries["conv_alpha"]["title"] == "Alpha title"
    assert summaries["conv_alpha"]["title_source"] == "model"
    assert summaries["conv_alpha"]["is_resumable"] is True
    assert summaries["thread-beta"]["title"] == "New chat"
    assert summaries["thread-beta"]["title_source"] == "pending"
    assert summaries["thread-beta"]["is_resumable"] is False
    assert cursor.last_params[-2:] == ("conv_alpha", "thread-beta")
    assert "conversation_id IN (?,?)" in cursor.last_query
