"""Guards backend rehydrate ownership wording."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

REHYDRATE_BOUNDARY_FILES = [
    "backend/src/api/handlers/rehydrate.py",
    "backend/src/api/services/rehydrate_execution.py",
    "backend/src/agent/session/session.py",
    "docs/backend/api/handler_behavior_matrix.md",
    "docs/backend/runtime/session_state_and_lifecycle.md",
    "docs/backend/agent/session_runtime_and_config_rewire_reference.md",
    "docs/backend/inventory/backend_full_functionality_inventory_reference.md",
    "docs/backend/api/services/rehydrate_and_wakeword_execution_service_and_tts_session_reference.md",
]


def _read(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def test_rehydrate_boundary_wording_routes_snapshots_through_sdk_runtime():
    combined_source = "\n".join(_read(path) for path in REHYDRATE_BOUNDARY_FILES)

    assert "SDK conversation snapshot" in combined_source
    assert "SDK-projected snapshot entries" in combined_source
    assert "SDK rehydrate snapshot" in combined_source
    assert "frontend transcript snapshot" not in combined_source
    assert "frontend-provided transcript snapshot" not in combined_source
    assert "frontend snapshot" not in combined_source
    assert "frontend transcript entry" not in combined_source
    assert "Memory storage is now handled by the frontend" not in combined_source
