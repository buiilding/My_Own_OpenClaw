from typing import Any, Dict, List, Tuple

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory import conversation_list_runtime as runtime  # noqa: E402


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
    assert results[0]["is_resumable"] is True
