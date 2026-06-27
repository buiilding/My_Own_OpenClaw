"""Covers local-runtime conversation search helper behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory.conversation_search_helpers import build_content_snippet  # noqa: E402
from memory.conversation_search_helpers import build_fts_query  # noqa: E402
from memory.conversation_search_helpers import extract_query_terms  # noqa: E402
from memory.conversation_search_helpers import group_conversation_search_hits  # noqa: E402
from memory.conversation_search_helpers import pick_best_conversation_hit  # noqa: E402
from memory.conversation_search_helpers import safe_timestamp_to_epoch_seconds  # noqa: E402


def test_extract_query_terms_dedupes_filters_short_and_limits_count():
    terms = extract_query_terms(
        "A a legal legal lawyer outreach outreach _id x y z alpha beta gamma delta epsilon"
    )

    assert terms == ["legal", "lawyer", "outreach", "_id", "alpha", "beta", "gamma", "delta"]


def test_build_fts_query_uses_prefix_wildcards_and_empty_fallback():
    assert build_fts_query("lawyer outreach") == "lawyer* outreach*"
    assert build_fts_query("x") == ""


def test_build_content_snippet_focuses_near_query_hit_for_long_text():
    content = (
        "prefix " * 40
        + "critical phrase appears here near the middle "
        + "suffix " * 40
    )

    snippet = build_content_snippet(content, "critical phrase")

    assert "critical phrase" in snippet.lower()
    assert snippet.startswith("…")
    assert snippet.endswith("…")


def test_group_and_pick_best_conversation_hit_prefers_lexical_and_dedupes_memory_id():
    lexical_hits = [
        {
            "memory_id": "m1",
            "conversation_id": "conv_1",
            "source": "lexical",
            "score": 0.4,
            "role": "assistant",
            "timestamp": "2026-01-01T00:00:00+00:00",
            "snippet": "lexical 1",
        },
        {
            "memory_id": "m2",
            "conversation_id": "conv_1",
            "source": "lexical",
            "score": 0.7,
            "role": "user",
            "timestamp": "2026-01-02T00:00:00+00:00",
            "snippet": "lexical 2",
        },
    ]
    semantic_hits = [
        {
            "memory_id": "m2",
            "conversation_id": "conv_1",
            "source": "semantic",
            "score": 0.9,
            "role": "assistant",
            "timestamp": "2026-01-03T00:00:00+00:00",
            "snippet": "semantic duplicate memory id",
        }
    ]

    grouped = group_conversation_search_hits(lexical_hits, semantic_hits)
    payload = grouped["conv_1"]

    assert payload["match_count"] == 2
    assert payload["lexical_match_count"] == 2
    assert payload["semantic_match_count"] == 0
    assert payload["lexical_best"] == 0.7

    best_hit = pick_best_conversation_hit(payload)
    assert best_hit["source"] == "lexical"
    assert best_hit["snippet"] == "lexical 2"


def test_safe_timestamp_to_epoch_seconds_handles_z_suffix_and_invalid_values():
    assert safe_timestamp_to_epoch_seconds("2026-01-01T00:00:00Z") > 0
    assert safe_timestamp_to_epoch_seconds("not-a-time") == 0.0
    assert safe_timestamp_to_epoch_seconds(None) == 0.0
