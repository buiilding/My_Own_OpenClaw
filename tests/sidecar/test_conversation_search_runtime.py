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


class _FakeConn:
    def __init__(self, cursor_obj: Any) -> None:
        self._cursor = cursor_obj
        self.row_factory = None
        self.committed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def cursor(self):
        return self._cursor

    async def commit(self):
        self.committed = True


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
            "first_user_content": "Draft release checklist for beta launch",
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
            return row.get("first_user_content"), "heuristic"
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
    assert summaries["thread-beta"]["title"] == "Draft release checklist for beta launch"
    assert summaries["thread-beta"]["title_source"] == "heuristic"
    assert summaries["thread-beta"]["is_resumable"] is False
    assert cursor.last_params[-2:] == ("conv_alpha", "thread-beta")
    assert "conversation_id IN (?,?)" in cursor.last_query


def test_build_ranked_conversation_search_rows_sorts_by_score_and_recency_tiebreak():
    grouped_hits = {
        "conv_a": {
            "hits": [
                {
                    "source": "lexical",
                    "role": "assistant",
                    "timestamp": "2026-01-01T00:00:00+00:00",
                    "snippet": "alpha snippet",
                }
            ],
            "lexical_best": 0.7,
            "semantic_best": 0.0,
            "match_count": 1,
            "lexical_match_count": 1,
            "semantic_match_count": 0,
        },
        "conv_b": {
            "hits": [
                {
                    "source": "lexical",
                    "role": "assistant",
                    "timestamp": "2026-01-01T00:00:00+00:00",
                    "snippet": "beta snippet",
                }
            ],
            "lexical_best": 0.7,
            "semantic_best": 0.0,
            "match_count": 1,
            "lexical_match_count": 1,
            "semantic_match_count": 0,
        },
        "conv_missing_summary": {
            "hits": [
                {
                    "source": "semantic",
                    "role": "assistant",
                    "timestamp": "2026-01-01T00:00:00+00:00",
                    "snippet": "ignored",
                }
            ],
            "lexical_best": 1.0,
            "semantic_best": 1.0,
            "match_count": 9,
            "lexical_match_count": 1,
            "semantic_match_count": 1,
        },
    }
    summaries = {
        "conv_a": {
            "conversation_id": "conv_a",
            "last_timestamp": "2026-01-01T00:00:00+00:00",
            "title": "A",
            "title_source": "model",
            "is_resumable": True,
            "model_id": "gpt-5-mini",
            "model_provider": "openai",
            "first_timestamp": "2026-01-01T00:00:00+00:00",
            "entry_count": 2,
        },
        "conv_b": {
            "conversation_id": "conv_b",
            "last_timestamp": "2026-01-02T00:00:00+00:00",
            "title": "B",
            "title_source": "model",
            "is_resumable": True,
            "model_id": "gpt-5-mini",
            "model_provider": "openai",
            "first_timestamp": "2026-01-02T00:00:00+00:00",
            "entry_count": 2,
        },
    }

    rows = runtime.build_ranked_conversation_search_rows(
        grouped_hits=grouped_hits,
        summaries=summaries,
        limit=5,
        now_epoch_seconds=1735905600.0,  # 2025-01-03T00:00:00Z
    )

    assert [row["conversation_id"] for row in rows] == ["conv_b", "conv_a"]
    assert all(row["score"] > 0.0 for row in rows)
    assert rows[0]["match_source"] == "lexical"
    assert rows[0]["snippet"] == "beta snippet"
    assert all(row["conversation_id"] != "conv_missing_summary" for row in rows)


def test_build_ranked_conversation_search_rows_applies_limit_floor():
    grouped_hits = {
        "conv_a": {
            "hits": [{"source": "semantic", "role": "assistant", "timestamp": None, "snippet": "a"}],
            "lexical_best": 0.0,
            "semantic_best": 0.8,
            "match_count": 2,
            "lexical_match_count": 0,
            "semantic_match_count": 1,
        },
        "conv_b": {
            "hits": [{"source": "semantic", "role": "assistant", "timestamp": None, "snippet": "b"}],
            "lexical_best": 0.0,
            "semantic_best": 0.5,
            "match_count": 1,
            "lexical_match_count": 0,
            "semantic_match_count": 1,
        },
    }
    summaries = {
        "conv_a": {"conversation_id": "conv_a", "last_timestamp": "2026-01-02T00:00:00+00:00"},
        "conv_b": {"conversation_id": "conv_b", "last_timestamp": "2026-01-01T00:00:00+00:00"},
    }

    rows = runtime.build_ranked_conversation_search_rows(
        grouped_hits=grouped_hits,
        summaries=summaries,
        limit=0,
        now_epoch_seconds=1735905600.0,
    )

    assert len(rows) == 1


@pytest.mark.asyncio
async def test_search_transcript_conversations_returns_early_for_short_queries(monkeypatch):
    class _NoConnect:
        Row = object

        @staticmethod
        def connect(*_args, **_kwargs):
            raise AssertionError("should not connect for short queries")

    monkeypatch.setattr(runtime, "aiosqlite", _NoConnect)

    rows = await runtime.search_transcript_conversations(
        store=object(),
        episodic_db_path="/tmp/ignored.db",
        user_id="user-1",
        query="x",
        limit=5,
        lexical_limit=10,
        semantic_limit=5,
        logger=logging.getLogger(__name__),
        now_epoch_seconds=123.0,
    )

    assert rows == []


@pytest.mark.asyncio
async def test_search_transcript_conversations_short_circuits_when_grouped_hits_empty(monkeypatch):
    connect_calls: List[str] = []

    class _FakeSqlite:
        Row = object

        @staticmethod
        def connect(_db_path: str):
            connect_calls.append("connect")
            return _FakeConn(cursor_obj=object())

    async def _lexical(**_kwargs):
        return []

    async def _semantic(**_kwargs):
        return []

    async def _unexpected_fetch(**_kwargs):
        raise AssertionError("summary fetch should not run when grouped hits are empty")

    monkeypatch.setattr(runtime, "aiosqlite", _FakeSqlite)
    monkeypatch.setattr(runtime, "search_transcript_hits_lexical", _lexical)
    monkeypatch.setattr(runtime, "search_transcript_hits_semantic", _semantic)
    monkeypatch.setattr(runtime, "fetch_conversation_summaries", _unexpected_fetch)

    rows = await runtime.search_transcript_conversations(
        store=object(),
        episodic_db_path="/tmp/ignored.db",
        user_id="user-1",
        query="valid query",
        limit=5,
        lexical_limit=10,
        semantic_limit=5,
        logger=logging.getLogger(__name__),
        now_epoch_seconds=123.0,
    )

    assert rows == []
    assert len(connect_calls) == 1
