"""Covers local-runtime memory operations behavior."""

from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import memory.operations as memory_operations_module  # noqa: E402
import memory.record_kinds as memory_record_kinds_module  # noqa: E402
from memory.operations import (  # noqa: E402
    build_semanticization_metadata,
    build_completed_turn_memory_metadata,
    build_store_memory_response_data,
    classify_semantic_summarization_result,
    filter_results_by_min_score,
    group_memory_texts,
    is_durable_semantic_text,
    normalize_and_store_memory_by_embedding,
    normalize_semantic_fact_list,
    normalize_semantic_summary,
    normalize_search_memory_selection,
    normalize_store_memory_by_embedding_payload,
    store_memory_by_embedding,
)

MEMORY_TEST_LABEL_PATHS = [
    "test_chat_event_store.py",
    "test_conversation_search_helpers.py",
    "test_conversation_semanticization_runtime.py",
    "test_conversation_window_runtime.py",
    "test_local_store_init.py",
    "test_local_store_delete_cleanup.py",
    "test_memory_summarizer.py",
    "test_memory_operations.py",
    "test_system_metrics_and_watermark_state.py",
]


def test_local_runtime_memory_tests_use_boundary_docstrings():
    test_dir = Path(__file__).parent
    source_texts = {
        name: (test_dir / name).read_text(encoding="utf-8")
        for name in MEMORY_TEST_LABEL_PATHS
    }
    module_headers = {
        name: source.splitlines()[0]
        for name, source in source_texts.items()
    }
    retired_suite_label = "behavior in the " + "sidecar test suite"

    expected_headers = {
        "test_chat_event_store.py": '"""Covers local-runtime conversation event store behavior."""',
        "test_conversation_search_helpers.py": '"""Covers local-runtime conversation search helper behavior."""',
        "test_conversation_semanticization_runtime.py": '"""Covers local-runtime conversation semanticization behavior."""',
        "test_conversation_window_runtime.py": '"""Covers local-runtime conversation window behavior."""',
        "test_local_store_init.py": '"""Covers local-runtime memory store initialization behavior."""',
        "test_local_store_delete_cleanup.py": '"""Covers local-runtime memory store delete cleanup behavior."""',
        "test_memory_summarizer.py": '"""Covers local-runtime memory summarizer behavior."""',
        "test_memory_operations.py": '"""Covers local-runtime memory operations behavior."""',
        "test_system_metrics_and_watermark_state.py": '"""Covers local-runtime memory metrics and watermark state behavior."""',
    }

    for name, expected_header in expected_headers.items():
        assert module_headers[name] == expected_header
        assert retired_suite_label not in source_texts[name]


def test_memory_operations_module_doc_uses_local_runtime_wording():
    assert "local-runtime services" in (memory_operations_module.__doc__ or "")
    assert "sidecar services" not in (memory_operations_module.__doc__ or "")


def test_memory_record_kind_module_doc_uses_local_runtime_wording():
    assert "local-runtime memory record-kind" in (
        memory_record_kinds_module.__doc__ or ""
    )
    assert "sidecar memory " + "record-kind" not in (
        memory_record_kinds_module.__doc__ or ""
    )


@pytest.mark.parametrize(
    ("content", "embedding", "embedding_space_version", "memory_type", "expected_error"),
    [
        (None, [1.0], "space-1", "episodic", "Missing content"),
        (1, [1.0], "space-1", "episodic", "content must be a string"),
        ("hi", [1.0], "space-1", 1, "memory_type must be a string"),
        ("hi", [1.0], "space-1", "archive", "Invalid memory_type: archive"),
        ("   ", [1.0], "space-1", "episodic", "Missing content"),
        ("hi", [], "space-1", "episodic", "embedding must be a non-empty list"),
        ("hi", ["bad"], "space-1", "episodic", "embedding entries must be numbers"),
        ("hi", [1.0], 7, "episodic", "embedding_space_version must be a string"),
    ],
)
def test_normalize_store_memory_by_embedding_payload_rejects_invalid_inputs(
    content,
    embedding,
    embedding_space_version,
    memory_type,
    expected_error,
):
    normalized, error = normalize_store_memory_by_embedding_payload(
        content=content,
        embedding=embedding,
        embedding_space_version=embedding_space_version,
        memory_type=memory_type,
    )
    assert normalized is None
    assert error == expected_error


def test_normalize_store_memory_by_embedding_payload_returns_normalized_values():
    normalized, error = normalize_store_memory_by_embedding_payload(
        content="  User: hi\nAssistant: hello  ",
        embedding=[1, 2.5],
        embedding_space_version="  space-1 ",
        memory_type="  SEMANTIC ",
    )
    assert error is None
    assert normalized == {
        "content": "User: hi\nAssistant: hello",
        "embedding": [1.0, 2.5],
        "embedding_space_version": "space-1",
        "memory_type": "semantic",
    }


def test_normalize_store_memory_by_embedding_payload_defaults_memory_type():
    normalized, error = normalize_store_memory_by_embedding_payload(
        content="User: hi\nAssistant: hello",
        embedding=[1.0],
        embedding_space_version=None,
        memory_type=None,
    )
    assert error is None
    assert normalized is not None
    assert normalized["memory_type"] == "episodic"


def test_normalize_search_memory_selection_returns_balanced_settings():
    normalized, error = normalize_search_memory_selection(
        limit=6,
        episodic_limit=4,
        semantic_limit=2,
        semantic_min_score=0.2,
    )

    assert error is None
    assert normalized == {
        "limit": 6,
        "episodic_limit": 4,
        "semantic_limit": 2,
        "semantic_min_score": 0.2,
        "use_balanced_limits": True,
    }


@pytest.mark.parametrize(
    ("kwargs", "expected_error"),
    [
        ({"limit": 0}, "limit must be greater than 0"),
        ({"limit": "5"}, "limit must be an integer"),
        ({"limit": 5, "episodic_limit": 0}, "episodic_limit must be greater than 0"),
        ({"limit": 5, "semantic_limit": "2"}, "semantic_limit must be an integer"),
        (
            {"limit": 5, "semantic_min_score": 2},
            "semantic_min_score must be between 0 and 1",
        ),
    ],
)
def test_normalize_search_memory_selection_rejects_invalid_values(
    kwargs, expected_error
):
    normalized, error = normalize_search_memory_selection(**kwargs)

    assert normalized is None
    assert error == expected_error


def test_filter_results_by_min_score_keeps_only_results_at_or_above_threshold():
    filtered = filter_results_by_min_score(
        [
            {"type": "semantic", "text": "high", "score": 0.9},
            {"type": "semantic", "text": "edge", "score": 0.2},
            {"type": "semantic", "text": "low", "score": 0.19},
            {"type": "semantic", "text": "missing"},
        ],
        0.2,
    )

    assert filtered == [
        {"type": "semantic", "text": "high", "score": 0.9},
        {"type": "semantic", "text": "edge", "score": 0.2},
    ]


def test_build_store_memory_response_data():
    assert build_store_memory_response_data(
        memory_id="memory-1",
        memory_type="episodic",
    ) == {
        "memory_id": "memory-1",
        "memory_type": "episodic",
        "message": "Stored episodic memory",
    }


def test_normalize_semantic_summary_clears_explicit_no_durable_markers():
    assert normalize_semantic_summary("NONE") == ""
    assert normalize_semantic_summary("No durable facts.") == ""
    assert normalize_semantic_summary("User prefers terminal workflows.") == (
        "User prefers terminal workflows."
    )


def test_normalize_semantic_fact_list_dedupes_and_strips():
    assert normalize_semantic_fact_list(
        [" uses Codex heavily ", "Uses Codex heavily", "", None]
    ) == ["uses Codex heavily"]


def test_classify_semantic_summarization_result_marks_stored_when_durable_facts_exist():
    result = classify_semantic_summarization_result(
        "User workflow details.",
        ["Uses Linux daily", "Prefers terminal tools"],
    )

    assert result == {
        "summary": "User workflow details.",
        "facts": ["Uses Linux daily", "Prefers terminal tools"],
        "durable_facts": ["Uses Linux daily", "Prefers terminal tools"],
        "status": "stored",
    }


def test_classify_semantic_summarization_result_marks_no_durable_memory_explicitly():
    result = classify_semantic_summarization_result("NONE", [])

    assert result == {
        "summary": "",
        "facts": [],
        "durable_facts": [],
        "status": "skipped_no_durable_memory",
    }


def test_classify_semantic_summarization_result_marks_low_signal_when_only_filtered_facts_exist():
    result = classify_semantic_summarization_result(
        "No durable memory",
        [
            "No user preferences stated",
            "User initiated contact with a casual greeting",
        ],
    )

    assert result == {
        "summary": "",
        "facts": [
            "No user preferences stated",
            "User initiated contact with a casual greeting",
        ],
        "durable_facts": [],
        "status": "skipped_low_signal",
    }


def test_build_semanticization_metadata_shapes_runtime_patch():
    metadata = build_semanticization_metadata(
        status="skipped_no_durable_memory",
        summary_hash="hash-123",
        durable_fact_count=0,
        skipped_fact_count=2,
    )

    assert metadata["semantic_status"] == "skipped_no_durable_memory"
    assert metadata["semantic_summary_hash"] == "hash-123"
    assert metadata["semantic_durable_fact_count"] == 0
    assert metadata["semantic_skipped_fact_count"] == 2
    assert "semantic_processed_at" in metadata


class _DummyStore:
    def __init__(self):
        self.calls = []

    async def add(self, content, user_id, metadata, conversation_id=None, **kwargs):
        self.calls.append((content, user_id, metadata, conversation_id, kwargs))
        return "mem-42"


@pytest.mark.asyncio
async def test_store_memory_by_embedding_persists_entry_with_vector():
    store = _DummyStore()

    memory_id = await store_memory_by_embedding(
        store,
        content="User: hi\nAssistant: hello",
        embedding=[0.1, 0.2],
        embedding_space_version="space-1",
        memory_type="episodic",
        user_id="user-1",
        conversation_id="session-1",
    )

    assert memory_id == "mem-42"
    assert store.calls == [
        (
            "User: hi\nAssistant: hello",
            "user-1",
            build_completed_turn_memory_metadata("episodic", "session-1"),
            "session-1",
            {
                "record_kind": "interaction",
                "embedding": [0.1, 0.2],
                "embedding_space_version": "space-1",
            },
        )
    ]


@pytest.mark.asyncio
async def test_normalize_and_store_memory_by_embedding_returns_validation_error():
    store = _DummyStore()

    stored, error = await normalize_and_store_memory_by_embedding(
        store,
        content="",
        embedding=[0.1],
        embedding_space_version="space-1",
        memory_type="episodic",
        user_id="user-1",
        conversation_id="session-1",
    )

    assert stored is None
    assert error == "Missing content"
    assert store.calls == []


@pytest.mark.asyncio
async def test_normalize_and_store_memory_by_embedding_persists_and_returns_metadata():
    store = _DummyStore()

    stored, error = await normalize_and_store_memory_by_embedding(
        store,
        content="  User: hi\nAssistant: hello  ",
        embedding=[0.1, 0.2],
        embedding_space_version="space-1",
        memory_type="  SEMANTIC ",
        user_id="user-1",
        conversation_id="session-1",
    )

    assert error is None
    assert stored == {
        "memory_id": "mem-42",
        "memory_type": "semantic",
    }
    assert store.calls == [
        (
            "User: hi\nAssistant: hello",
            "user-1",
            build_completed_turn_memory_metadata("semantic", "session-1"),
            "session-1",
            {
                "record_kind": "interaction",
                "embedding": [0.1, 0.2],
                "embedding_space_version": "space-1",
            },
        )
    ]


@pytest.mark.asyncio
async def test_normalize_and_store_memory_by_embedding_sanitizes_lone_surrogates():
    store = _DummyStore()

    stored, error = await normalize_and_store_memory_by_embedding(
        store,
        content="User: hello\udc9duser\nAssistant: hello\udc9dassistant",
        embedding=[0.1],
        embedding_space_version="space-1",
        memory_type="episodic",
        user_id="user-1",
        conversation_id="session-1",
    )

    assert error is None
    assert stored == {
        "memory_id": "mem-42",
        "memory_type": "episodic",
    }
    assert store.calls[0][0] == "User: hello�user\nAssistant: hello�assistant"


def test_group_memory_texts_prefers_user_assistant_interactions_for_episodic():
    grouped = group_memory_texts(
        [
            {
                "type": "episodic",
                "text": "single memory row",
                "metadata": {"record_kind": "memory"},
            },
            {
                "type": "episodic",
                "text": "User: plan trip\nAssistant: Start with flights",
                "metadata": {"source": "interaction_completed"},
            },
            {
                "type": "semantic",
                "text": "User prefers aisle seats",
            },
        ]
    )

    assert grouped["episodic"] == ["User: plan trip\nAssistant: Start with flights"]
    assert grouped["semantic"] == ["User prefers aisle seats"]


def test_is_durable_semantic_text_rejects_low_signal_semantic_summary():
    assert (
        is_durable_semantic_text("""Summary: This is a brief, casual greeting exchange.
Facts:
- No user preferences stated
- No key facts about the user revealed
- User has Finder open showing the Applications folder (ephemeral context)
""") is False
    )


def test_group_memory_texts_drops_low_signal_semantic_rows():
    grouped = group_memory_texts(
        [
            {
                "type": "semantic",
                "text": """Summary: This is a brief, casual greeting exchange.
Facts:
- No user preferences stated
- User initiated contact with a casual greeting
""",
            },
            {
                "type": "semantic",
                "text": """Summary: The user asked for their account details.
Facts:
- User's name is Peter Tuan Anh Bui
- User's email is peterbuics@gmail.com
""",
            },
        ]
    )

    assert grouped["semantic"] == ["""Summary: The user asked for their account details.
Facts:
- User's name is Peter Tuan Anh Bui
- User's email is peterbuics@gmail.com
"""]


def test_group_memory_texts_falls_back_when_no_interaction_style_episodic_rows():
    grouped = group_memory_texts(
        [
            {"type": "episodic", "text": "recent note"},
            {"type": "semantic", "text": "works in short bursts"},
        ]
    )

    assert grouped["episodic"] == ["recent note"]
    assert grouped["semantic"] == ["works in short bursts"]
