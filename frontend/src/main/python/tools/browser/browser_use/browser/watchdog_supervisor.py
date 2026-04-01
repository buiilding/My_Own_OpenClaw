"""Watchdog lifecycle ownership for BrowserSession."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
	from browser_use.browser.session import BrowserSession


class BrowserWatchdogSupervisor:
	"""Own watchdog initialization, attachment, and reset for BrowserSession."""

	def __init__(self, browser_session: 'BrowserSession') -> None:
		self._session = browser_session

	@property
	def logger(self):
		return self._session.logger

	def reset_watchdogs(self) -> None:
		self._session._crash_watchdog = None
		self._session._downloads_watchdog = None
		self._session._aboutblank_watchdog = None
		self._session._security_watchdog = None
		self._session._storage_state_watchdog = None
		self._session._local_browser_watchdog = None
		self._session._default_action_watchdog = None
		self._session._dom_watchdog = None
		self._session._screenshot_watchdog = None
		self._session._permissions_watchdog = None
		self._session._recording_watchdog = None
		self._session._har_recording_watchdog = None
		self._session._watchdogs_attached = False

	async def attach_all_watchdogs(self) -> None:
		"""Initialize and attach all watchdogs with explicit handler registration."""
		if getattr(self._session, '_watchdogs_attached', False):
			self.logger.debug('Watchdogs already attached, skipping duplicate attachment')
			return

		from browser_use.browser.watchdogs.aboutblank_watchdog import AboutBlankWatchdog
		from browser_use.browser.watchdogs.default_action_watchdog import DefaultActionWatchdog
		from browser_use.browser.watchdogs.dom_watchdog import DOMWatchdog
		from browser_use.browser.watchdogs.downloads_watchdog import DownloadsWatchdog
		from browser_use.browser.watchdogs.har_recording_watchdog import HarRecordingWatchdog
		from browser_use.browser.watchdogs.local_browser_watchdog import LocalBrowserWatchdog
		from browser_use.browser.watchdogs.permissions_watchdog import PermissionsWatchdog
		from browser_use.browser.watchdogs.popups_watchdog import PopupsWatchdog
		from browser_use.browser.watchdogs.recording_watchdog import RecordingWatchdog
		from browser_use.browser.watchdogs.screenshot_watchdog import ScreenshotWatchdog
		from browser_use.browser.watchdogs.security_watchdog import SecurityWatchdog
		from browser_use.browser.watchdogs.storage_state_watchdog import StorageStateWatchdog

		DownloadsWatchdog.model_rebuild()
		self._session._downloads_watchdog = DownloadsWatchdog(event_bus=self._session.event_bus, browser_session=self._session)
		self._session._downloads_watchdog.attach_to_session()
		if self._session.browser_profile.auto_download_pdfs:
			self.logger.debug('📄 PDF auto-download enabled for this session')

		should_enable_storage_state = (
			self._session.browser_profile.storage_state is not None
			or self._session.browser_profile.user_data_dir is not None
		)

		if should_enable_storage_state:
			StorageStateWatchdog.model_rebuild()
			self._session._storage_state_watchdog = StorageStateWatchdog(
				event_bus=self._session.event_bus,
				browser_session=self._session,
				auto_save_interval=60.0,
				save_on_change=False,
			)
			self._session._storage_state_watchdog.attach_to_session()
			self.logger.debug(
				f'🍪 StorageStateWatchdog enabled (storage_state: {bool(self._session.browser_profile.storage_state)}, user_data_dir: {bool(self._session.browser_profile.user_data_dir)})'
			)
		else:
			self.logger.debug('🍪 StorageStateWatchdog disabled (no storage_state or user_data_dir configured)')

		LocalBrowserWatchdog.model_rebuild()
		self._session._local_browser_watchdog = LocalBrowserWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._local_browser_watchdog.attach_to_session()

		SecurityWatchdog.model_rebuild()
		self._session._security_watchdog = SecurityWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._security_watchdog.attach_to_session()

		AboutBlankWatchdog.model_rebuild()
		self._session._aboutblank_watchdog = AboutBlankWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._aboutblank_watchdog.attach_to_session()

		PopupsWatchdog.model_rebuild()
		self._session._popups_watchdog = PopupsWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._popups_watchdog.attach_to_session()

		PermissionsWatchdog.model_rebuild()
		self._session._permissions_watchdog = PermissionsWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._permissions_watchdog.attach_to_session()

		DefaultActionWatchdog.model_rebuild()
		self._session._default_action_watchdog = DefaultActionWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._default_action_watchdog.attach_to_session()

		ScreenshotWatchdog.model_rebuild()
		self._session._screenshot_watchdog = ScreenshotWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._screenshot_watchdog.attach_to_session()

		DOMWatchdog.model_rebuild()
		self._session._dom_watchdog = DOMWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._dom_watchdog.attach_to_session()

		RecordingWatchdog.model_rebuild()
		self._session._recording_watchdog = RecordingWatchdog(
			event_bus=self._session.event_bus,
			browser_session=self._session,
		)
		self._session._recording_watchdog.attach_to_session()

		if self._session.browser_profile.record_har_path:
			HarRecordingWatchdog.model_rebuild()
			self._session._har_recording_watchdog = HarRecordingWatchdog(
				event_bus=self._session.event_bus,
				browser_session=self._session,
			)
			self._session._har_recording_watchdog.attach_to_session()

		self._session._watchdogs_attached = True
