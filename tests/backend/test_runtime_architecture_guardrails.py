from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def _read(rel_path: str) -> str:
    return (REPO_ROOT / rel_path).read_text()


def _line_count(rel_path: str) -> int:
    return len((REPO_ROOT / rel_path).read_text().splitlines())


def test_runtime_module_size_guardrails():
    assert _line_count("backend/src/agent/session/manager.py") <= 520
    assert _line_count("frontend/src/main/python/tools/browser/controller.py") <= 1700
    assert _line_count("frontend/src/main/python/tools/browser/browser_use/browser/session.py") <= 3200
    assert _line_count("frontend/src/main/python/tools/browser/action_executor.py") <= 1000
    assert _line_count("frontend/src/main/python/tools/browser/browser_use/browser/navigation_runtime.py") <= 350
    assert _line_count("frontend/src/main/python/tools/browser/browser_use/browser/watchdog_supervisor.py") <= 220


def test_session_manager_is_no_longer_the_owner_of_transition_alias_state():
    manager_source = _read("backend/src/agent/session/manager.py")

    assert "self.active_sessions =" not in manager_source
    assert "self._user_locks =" not in manager_source
    assert "self._active_query_tasks =" not in manager_source
    assert "self._frontend_operating_systems =" not in manager_source
    assert "self._latest_conversation_refs =" not in manager_source
    assert "self._user_config_overrides =" not in manager_source


def test_session_registry_does_not_assemble_config():
    registry_source = _read("backend/src/agent/session/session_registry.py")

    assert "AppConfig" not in registry_source
    assert "render_system_prompt" not in registry_source
    assert "update_config(" not in registry_source


def test_session_config_service_does_not_own_query_cancellation():
    config_source = _read("backend/src/agent/session/session_config_service.py")

    assert "register_active_query_task" not in config_source
    assert "cancel_active_query_task" not in config_source
    assert "pending_stop_requests" not in config_source
