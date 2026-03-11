import asyncio
import logging
from types import SimpleNamespace

import pytest

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.browser.session_manager import SessionManager


def _make_manager(
	sessions_by_target: dict[str, object | None],
	target_types: dict[str, str],
	target_urls: dict[str, str] | None = None,
) -> SessionManager:
	target_urls = target_urls or {}
	manager = SessionManager.__new__(SessionManager)
	manager._targets = {
		target_id: SimpleNamespace(
			target_id=target_id,
			target_type=target_type,
			url=target_urls.get(target_id, ''),
			title='',
		)
		for target_id, target_type in target_types.items()
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


def test_get_all_page_targets_excludes_internal_omnibox_surfaces():
	manager = _make_manager(
		sessions_by_target={},
		target_types={
			'user-tab': 'page',
			'new-tab': 'page',
			'omnibox-popup': 'page',
			'worker': 'service_worker',
		},
		target_urls={
			'user-tab': 'https://example.com',
			'new-tab': 'about:blank',
			'omnibox-popup': 'chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html',
			'worker': '',
		},
	)

	assert [target.target_id for target in manager.get_all_page_targets()] == ['user-tab', 'new-tab']


@pytest.mark.asyncio
async def test_recover_agent_focus_ignores_internal_omnibox_surfaces():
	manager = _make_manager(
		sessions_by_target={},
		target_types={
			'user-tab': 'page',
			'omnibox-popup': 'page',
		},
		target_urls={
			'user-tab': 'https://example.com',
			'omnibox-popup': 'chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html',
		},
	)

	activated_targets: list[str] = []
	dispatched_events: list[object] = []

	class _FakeTargetCommands:
		async def activateTarget(self, params: dict[str, str]) -> None:
			activated_targets.append(params['targetId'])

	class _FakeSend:
		def __init__(self) -> None:
			self.Target = _FakeTargetCommands()

	browser_session = SimpleNamespace(
		logger=logging.getLogger(__name__),
		_cdp_client_root=SimpleNamespace(send=_FakeSend()),
		agent_focus_target_id=None,
		event_bus=SimpleNamespace(dispatch=dispatched_events.append),
	)

	manager.browser_session = browser_session
	manager.logger = browser_session.logger
	manager._recovery_lock = asyncio.Lock()
	manager._recovery_in_progress = False
	manager._recovery_complete_event = None
	manager._recovery_task = None
	manager._get_session_for_target = lambda target_id: object() if target_id == 'user-tab' else None  # type: ignore[method-assign]

	await manager._recover_agent_focus('crashed-target')

	assert browser_session.agent_focus_target_id == 'user-tab'
	assert activated_targets == ['user-tab']
	assert dispatched_events
