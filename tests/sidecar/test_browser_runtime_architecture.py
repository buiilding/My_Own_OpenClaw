from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def _read(rel_path: str) -> str:
    return (REPO_ROOT / rel_path).read_text()


def test_browser_controller_and_session_use_extracted_runtime_owners():
    controller_source = _read("frontend/src/main/python/tools/browser/controller.py")
    session_source = _read("frontend/src/main/python/tools/browser/browser_use/browser/session.py")

    assert "from tools.browser.action_executor import BrowserActionExecutor" in controller_source
    assert "self._action_executor = BrowserActionExecutor(self)" in controller_source
    assert "BrowserSessionNavigationRuntime" in session_source
    assert "BrowserWatchdogSupervisor" in session_source
    assert "await self._navigation_runtime.on_NavigateToUrlEvent(event)" in session_source
    assert "await self._watchdog_supervisor.attach_all_watchdogs()" in session_source


def test_watchdog_supervisor_does_not_store_global_browser_state():
    watchdog_source = _read(
        "frontend/src/main/python/tools/browser/browser_use/browser/watchdog_supervisor.py"
    )

    assert "agent_focus_target_id" not in watchdog_source
    assert "session_manager" not in watchdog_source
