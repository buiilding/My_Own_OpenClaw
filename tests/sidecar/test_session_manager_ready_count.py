from types import SimpleNamespace

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.browser.session_manager import SessionManager


def _make_manager(sessions_by_target: dict[str, object | None], target_types: dict[str, str]) -> SessionManager:
	manager = SessionManager.__new__(SessionManager)
	manager._targets = {
		target_id: SimpleNamespace(target_type=target_type) for target_id, target_type in target_types.items()
	}
	manager._get_session_for_target = sessions_by_target.get  # type: ignore[method-assign]
	return manager


def test_count_ready_target_sessions_requires_lifecycle_for_pages():
	manager = _make_manager(
		sessions_by_target={
			'page-ready': SimpleNamespace(_lifecycle_events=[]),
			'page-pending': SimpleNamespace(),
			'worker-ready': SimpleNamespace(),
		},
		target_types={
			'page-ready': 'page',
			'page-pending': 'tab',
			'worker-ready': 'service_worker',
		},
	)

	assert manager._count_ready_target_sessions(['page-ready', 'page-pending', 'worker-ready']) == 2


def test_count_ready_target_sessions_skips_missing_sessions():
	manager = _make_manager(
		sessions_by_target={'page-missing': None},
		target_types={'page-missing': 'page'},
	)

	assert manager._count_ready_target_sessions(['page-missing']) == 0
