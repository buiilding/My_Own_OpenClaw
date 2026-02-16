from backend.src.agent.tools.preparation.storage.resolved_call_storage import (
    ResolvedToolCallStorage,
)


def test_resolved_tool_call_storage_register_get_remove_clear():
    storage = ResolvedToolCallStorage()
    resolved = {"tool": "click", "x": 1, "y": 2}

    assert storage.get("req-1") is None

    storage.register("req-1", resolved)
    assert storage.get("req-1") == resolved

    storage.remove("req-1")
    assert storage.get("req-1") is None

    storage.register("req-2", {"tool": "type"})
    storage.register("req-3", {"tool": "scroll"})
    storage.clear()
    assert storage.get("req-2") is None
    assert storage.get("req-3") is None


def test_register_overwrites_existing_request_id():
    storage = ResolvedToolCallStorage()
    first = {"tool": "click", "x": 1, "y": 2}
    second = {"tool": "click", "x": 10, "y": 20}

    storage.register("req-1", first)
    storage.register("req-1", second)

    assert storage.get("req-1") == second


def test_remove_missing_request_id_is_noop():
    storage = ResolvedToolCallStorage()

    storage.register("req-1", {"tool": "type"})
    storage.remove("does-not-exist")

    assert storage.get("req-1") == {"tool": "type"}


def test_clear_is_idempotent():
    storage = ResolvedToolCallStorage()
    storage.register("req-1", {"tool": "scroll"})

    storage.clear()
    storage.clear()

    assert storage.get("req-1") is None
