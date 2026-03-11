from types import SimpleNamespace

import pytest

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.browser.events import BrowserStateRequestEvent, NavigationCompleteEvent
from browser_use.browser.watchdogs.downloads_watchdog import DownloadsWatchdog


class _FakeLogger:
	def __init__(self):
		self.debug_messages = []
		self.warning_messages = []

	def debug(self, message):
		self.debug_messages.append(message)

	def warning(self, message):
		self.warning_messages.append(message)

	def info(self, _message):
		return None

	def error(self, _message):
		return None


class _FakeEventBus:
	def __init__(self):
		self.dispatched_events = []

	def dispatch(self, event):
		self.dispatched_events.append(event)
		return event


class _FakeBrowserSession:
	def __init__(self, *, auto_download_pdfs=True, focus_target_id='target-1234', url='https://example.com/doc.pdf'):
		self.agent_focus_target_id = focus_target_id
		self.browser_profile = SimpleNamespace(auto_download_pdfs=auto_download_pdfs)
		self.session_manager = SimpleNamespace(
			get_target=lambda target_id: SimpleNamespace(target_id=target_id, url=url) if focus_target_id else None
		)
		self.logger = _FakeLogger()

	async def get_or_create_cdp_session(self, *args, **kwargs):
		raise AssertionError('BrowserStateRequestEvent should not request a focused CDP session')


@pytest.mark.asyncio
async def test_browser_state_request_checks_pdf_without_synthetic_navigation(monkeypatch):
	event_bus = _FakeEventBus()
	browser_session = _FakeBrowserSession()
	watchdog = DownloadsWatchdog.model_construct(event_bus=event_bus, browser_session=browser_session)

	check_calls = []
	download_calls = []

	async def fake_check_for_pdf_viewer(self, target_id):
		check_calls.append(target_id)
		return True

	async def fake_trigger_pdf_download(self, target_id):
		download_calls.append(target_id)
		return '/tmp/doc.pdf'

	monkeypatch.setattr(DownloadsWatchdog, 'check_for_pdf_viewer', fake_check_for_pdf_viewer)
	monkeypatch.setattr(DownloadsWatchdog, 'trigger_pdf_download', fake_trigger_pdf_download)

	await watchdog.on_BrowserStateRequestEvent(BrowserStateRequestEvent())

	assert check_calls == ['target-1234']
	assert download_calls == ['target-1234']
	assert not any(isinstance(event, NavigationCompleteEvent) for event in event_bus.dispatched_events)


@pytest.mark.asyncio
async def test_browser_state_request_skips_when_auto_download_disabled():
	event_bus = _FakeEventBus()
	browser_session = _FakeBrowserSession(auto_download_pdfs=False)
	watchdog = DownloadsWatchdog.model_construct(event_bus=event_bus, browser_session=browser_session)

	await watchdog.on_BrowserStateRequestEvent(BrowserStateRequestEvent())

	assert event_bus.dispatched_events == []
	assert browser_session.logger.warning_messages == []
