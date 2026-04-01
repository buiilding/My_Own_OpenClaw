from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def _read(rel_path: str) -> str:
    return (REPO_ROOT / rel_path).read_text()


def test_navigation_runtime_owns_tab_and_download_lifecycle():
    source = _read(
        "frontend/src/main/python/tools/browser/browser_use/browser/navigation_runtime.py"
    )

    assert "class BrowserSessionNavigationRuntime" in source
    assert "async def on_NavigateToUrlEvent" in source
    assert "async def on_SwitchTabEvent" in source
    assert "async def on_TabCreatedEvent" in source
    assert "async def on_TabClosedEvent" in source
    assert "async def on_AgentFocusChangedEvent" in source
    assert "async def on_FileDownloadedEvent" in source


def test_watchdog_supervisor_owns_watchdog_reset_and_attachment():
    source = _read(
        "frontend/src/main/python/tools/browser/browser_use/browser/watchdog_supervisor.py"
    )

    assert "class BrowserWatchdogSupervisor" in source
    assert "def reset_watchdogs" in source
    assert "async def attach_all_watchdogs" in source
    assert "_watchdogs_attached = False" in source
    assert "_watchdogs_attached = True" in source
