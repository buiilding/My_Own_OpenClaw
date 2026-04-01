"""Navigation and tab lifecycle ownership for BrowserSession."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from browser_use.browser.events import (
	AgentFocusChangedEvent,
	FileDownloadedEvent,
	NavigateToUrlEvent,
	NavigationCompleteEvent,
	NavigationStartedEvent,
	SwitchTabEvent,
	TabCreatedEvent,
	TabClosedEvent,
)
from browser_use.utils import is_new_tab_page
from cdp_use.cdp.target import TargetID

if TYPE_CHECKING:
	from browser_use.browser.session import BrowserSession


class BrowserSessionNavigationRuntime:
	"""Own navigation, tab switching, and focus/cache lifecycle."""

	def __init__(self, browser_session: 'BrowserSession') -> None:
		self._session = browser_session

	@property
	def logger(self):
		return self._session.logger

	async def on_NavigateToUrlEvent(self, event: NavigateToUrlEvent) -> None:
		"""Handle navigation requests - core browser functionality."""
		self.logger.debug(f'[on_NavigateToUrlEvent] Received NavigateToUrlEvent: url={event.url}, new_tab={event.new_tab}')
		if not self._session.agent_focus_target_id:
			self.logger.warning('Cannot navigate - browser not connected')
			return

		target_id = None
		current_target_id = self._session.agent_focus_target_id

		current_target = self._session.session_manager.get_target(current_target_id)
		if event.new_tab and is_new_tab_page(current_target.url):
			self.logger.debug(f'[on_NavigateToUrlEvent] Already on blank tab ({current_target.url}), reusing')
			event.new_tab = False

		try:
			self.logger.debug(f'[on_NavigateToUrlEvent] Processing new_tab={event.new_tab}')

			if event.new_tab:
				page_targets = self._session.session_manager.get_all_page_targets()
				self.logger.debug(f'[on_NavigateToUrlEvent] Found {len(page_targets)} existing tabs')

				for idx, target in enumerate(page_targets):
					self.logger.debug(f'[on_NavigateToUrlEvent] Tab {idx}: url={target.url}, targetId={target.target_id}')
					if target.url == 'about:blank' and target.target_id != current_target_id:
						target_id = target.target_id
						self.logger.debug(f'Reusing existing about:blank tab #{target_id[-4:]}')
						break

				if not target_id:
					self.logger.debug('[on_NavigateToUrlEvent] No reusable about:blank tab found, creating new tab...')
					try:
						target_id = await self._session._cdp_create_new_page('about:blank')
						self.logger.debug(f'Created new tab #{target_id[-4:]}')
						await self._session.event_bus.dispatch(TabCreatedEvent(target_id=target_id, url='about:blank'))
					except Exception as e:
						self.logger.error(f'[on_NavigateToUrlEvent] Failed to create new tab: {type(e).__name__}: {e}')
						target_id = current_target_id
						self.logger.warning(f'[on_NavigateToUrlEvent] Falling back to current tab #{target_id[-4:]}')
			else:
				target_id = target_id or current_target_id

			if self._session.agent_focus_target_id is None or self._session.agent_focus_target_id != target_id:
				self.logger.debug(
					f'[on_NavigateToUrlEvent] Switching to target tab {target_id[-4:]} (current: {self._session.agent_focus_target_id[-4:] if self._session.agent_focus_target_id else "none"})'
				)
				await self._session.event_bus.dispatch(SwitchTabEvent(target_id=target_id))
			else:
				self.logger.debug(f'[on_NavigateToUrlEvent] Already on target tab {target_id[-4:]}, skipping SwitchTabEvent')

			assert self._session.agent_focus_target_id is not None and self._session.agent_focus_target_id == target_id, (
				'Agent focus not updated to new target_id after SwitchTabEvent should have switched to it'
			)

			await self._session.event_bus.dispatch(NavigationStartedEvent(target_id=target_id, url=event.url))
			await self._navigate_and_wait(event.url, target_id)
			await self._session._close_extension_options_pages()

			self.logger.debug(f'Dispatching NavigationCompleteEvent for {event.url} (tab #{target_id[-4:]})')
			await self._session.event_bus.dispatch(
				NavigationCompleteEvent(
					target_id=target_id,
					url=event.url,
					status=None,
				)
			)
			await self._session.event_bus.dispatch(AgentFocusChangedEvent(target_id=target_id, url=event.url))
		except Exception as e:
			self.logger.error(f'Navigation failed: {type(e).__name__}: {e}')
			if 'target_id' in locals() and target_id:
				await self._session.event_bus.dispatch(
					NavigationCompleteEvent(
						target_id=target_id,
						url=event.url,
						error_message=f'{type(e).__name__}: {e}',
					)
				)
				await self._session.event_bus.dispatch(AgentFocusChangedEvent(target_id=target_id, url=event.url))
			raise

	async def _navigate_and_wait(self, url: str, target_id: str, timeout: float | None = None) -> None:
		"""Navigate to URL and wait for page readiness using CDP lifecycle events."""
		cdp_session = await self._session.get_or_create_cdp_session(target_id, focus=False)

		if timeout is None:
			target = self._session.session_manager.get_target(target_id)
			current_url = target.url
			same_domain = (
				url.split('/')[2] == current_url.split('/')[2]
				if url.startswith('http') and current_url.startswith('http')
				else False
			)
			timeout = 2.0 if same_domain else 4.0

		nav_start_time = asyncio.get_event_loop().time()

		nav_result = await cdp_session.cdp_client.send.Page.navigate(
			params={'url': url, 'transitionType': 'address_bar'},
			session_id=cdp_session.session_id,
		)

		if nav_result.get('errorText'):
			raise RuntimeError(f'Navigation failed: {nav_result["errorText"]}')

		navigation_id = nav_result.get('loaderId')
		start_time = asyncio.get_event_loop().time()
		seen_events = []

		if not hasattr(cdp_session, '_lifecycle_events'):
			raise RuntimeError(
				f'❌ Lifecycle monitoring not enabled for {cdp_session.target_id[:8]}! '
				f'This is a bug - SessionManager should have initialized it. '
				f'Session: {cdp_session}'
			)

		poll_interval = 0.05
		while (asyncio.get_event_loop().time() - start_time) < timeout:
			try:
				for event_data in list(cdp_session._lifecycle_events):
					event_name = event_data.get('name')
					event_loader_id = event_data.get('loaderId')

					event_str = f'{event_name}(loader={event_loader_id[:8] if event_loader_id else "none"})'
					if event_str not in seen_events:
						seen_events.append(event_str)

					if event_loader_id and navigation_id and event_loader_id != navigation_id:
						continue

					if event_name == 'networkIdle':
						duration_ms = (asyncio.get_event_loop().time() - nav_start_time) * 1000
						self.logger.debug(f'✅ Page ready for {url} (networkIdle, {duration_ms:.0f}ms)')
						return

					if event_name == 'load':
						duration_ms = (asyncio.get_event_loop().time() - nav_start_time) * 1000
						self.logger.debug(f'✅ Page ready for {url} (load, {duration_ms:.0f}ms)')
						return
			except Exception as e:
				self.logger.debug(f'Error polling lifecycle events: {e}')

			await asyncio.sleep(poll_interval)

		duration_ms = (asyncio.get_event_loop().time() - nav_start_time) * 1000
		if not seen_events:
			self.logger.warning(
				f'⚠️ No lifecycle events received for {url} after {duration_ms:.0f}ms; '
				f'continuing without readiness signal. Monitoring may have failed. Target: {cdp_session.target_id[:8]}'
			)
		else:
			self.logger.warning(f'⚠️ Page readiness timeout ({timeout}s, {duration_ms:.0f}ms) for {url}')

	async def on_SwitchTabEvent(self, event: SwitchTabEvent) -> TargetID:
		"""Handle tab switching - core browser functionality."""
		if not self._session.agent_focus_target_id:
			raise RuntimeError('Cannot switch tabs - browser not connected')

		page_targets = self._session.session_manager.get_all_page_targets()
		if event.target_id is None:
			if page_targets:
				event.target_id = page_targets[-1].target_id
			else:
				assert self._session._cdp_client_root is not None, 'CDP client root not initialized - browser may not be connected yet'
				new_target = await self._session._cdp_client_root.send.Target.createTarget(params={'url': 'about:blank'})
				target_id = new_target['targetId']
				self._session.event_bus.dispatch(TabCreatedEvent(url='about:blank', target_id=target_id))
				self._session.event_bus.dispatch(AgentFocusChangedEvent(target_id=target_id, url='about:blank'))
				return target_id

		assert event.target_id is not None, 'target_id must be set at this point'
		cdp_session = await self._session.get_or_create_cdp_session(target_id=event.target_id, focus=True)
		await cdp_session.cdp_client.send.Target.activateTarget(params={'targetId': event.target_id})
		target = self._session.session_manager.get_target(event.target_id)

		await self._session.event_bus.dispatch(
			AgentFocusChangedEvent(
				target_id=target.target_id,
				url=target.url,
			)
		)
		return target.target_id

	async def on_TabCreatedEvent(self, event: TabCreatedEvent) -> None:
		"""Handle tab creation - apply viewport settings to new tab."""
		if self._session.browser_profile.viewport and not self._session.browser_profile.no_viewport:
			try:
				viewport_width = self._session.browser_profile.viewport.width
				viewport_height = self._session.browser_profile.viewport.height
				device_scale_factor = self._session.browser_profile.device_scale_factor or 1.0

				self.logger.info(
					f'Setting viewport to {viewport_width}x{viewport_height} with device scale factor {device_scale_factor} whereas original device scale factor was {self._session.browser_profile.device_scale_factor}'
				)
				await self._session._cdp_set_viewport(
					viewport_width,
					viewport_height,
					device_scale_factor,
					target_id=event.target_id,
				)

				self.logger.debug(f'Applied viewport {viewport_width}x{viewport_height} to tab {event.target_id[-8:]}')
			except Exception as e:
				self.logger.warning(f'Failed to set viewport for new tab {event.target_id[-8:]}: {e}')

	async def on_TabClosedEvent(self, event: TabClosedEvent) -> None:
		"""Handle tab closure - update focus if needed."""
		if not self._session.agent_focus_target_id:
			return

		current_target_id = self._session.agent_focus_target_id
		if current_target_id == event.target_id:
			await self._session.event_bus.dispatch(SwitchTabEvent(target_id=None))

	async def on_AgentFocusChangedEvent(self, event: AgentFocusChangedEvent) -> None:
		"""Handle agent focus change - update focus and clear cache."""
		self.logger.debug(f'🔄 AgentFocusChangedEvent received: target_id=...{event.target_id[-4:]} url={event.url}')

		if self._session._dom_watchdog:
			self._session._dom_watchdog.clear_cache()

		self._session._cached_browser_state_summary = None
		self._session._cached_selector_map.clear()
		self.logger.debug('🔄 Cached browser state cleared')

		if event.target_id:
			await self._session.get_or_create_cdp_session(target_id=event.target_id, focus=True)

			if self._session.browser_profile.viewport and not self._session.browser_profile.no_viewport:
				try:
					viewport_width = self._session.browser_profile.viewport.width
					viewport_height = self._session.browser_profile.viewport.height
					device_scale_factor = self._session.browser_profile.device_scale_factor or 1.0

					await self._session._cdp_set_viewport(
						viewport_width,
						viewport_height,
						device_scale_factor,
						target_id=event.target_id,
					)

					self.logger.debug(f'Applied viewport {viewport_width}x{viewport_height} to tab {event.target_id[-8:]}')
				except Exception as e:
					self.logger.warning(f'Failed to set viewport for tab {event.target_id[-8:]}: {e}')
		else:
			raise RuntimeError('AgentFocusChangedEvent received with no target_id for newly focused tab')

	async def on_FileDownloadedEvent(self, event: FileDownloadedEvent) -> None:
		"""Track downloaded files during this session."""
		self.logger.debug(f'FileDownloadedEvent received: {event.file_name} at {event.path}')
		if event.path and event.path not in self._session._downloaded_files:
			self._session._downloaded_files.append(event.path)
			self.logger.info(f'📁 Tracked download: {event.file_name} ({len(self._session._downloaded_files)} total downloads in session)')
		else:
			if not event.path:
				self.logger.warning(f'FileDownloadedEvent has no path: {event}')
			else:
				self.logger.debug(f'File already tracked: {event.path}')
