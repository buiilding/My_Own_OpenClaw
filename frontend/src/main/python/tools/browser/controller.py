"""
Browser controller for web automation via Playwright.

Primary mode:
1. WindieOS browser instance: Connect/launch dedicated Chrome via CDP
"""

import logging
import inspect
import tempfile
import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

# Playwright imports
from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

from tools.browser.chrome_detection import find_chrome_executable
from tools.browser.chrome_launcher import (
    DEFAULT_WINDIE_CDP_PORT,
    DEFAULT_WINDIE_CDP_URL,
    is_cdp_available,
    ensure_chrome_with_cdp,
    ChromeLauncherError,
)
from tools.browser.action_executor import BrowserActionExecutor
from tools.browser.enhanced_cdp_pipeline import EnhancedCdpDomPipeline
from tools.browser.observation_store import BrowserObservationStore
from tools.browser.ref_registry import RefRegistry
from tools.browser.session_runtime import BrowserSessionRuntime
from tools.browser.role_snapshot import (
    RoleRef,
    RoleSnapshotOptions,
    build_role_snapshot_from_aria_snapshot,
    get_role_snapshot_stats,
)

logger = logging.getLogger(__name__)


@dataclass
class PageSnapshot:
    """AI-friendly page snapshot."""

    text: str
    url: str = ""
    title: str = ""
    ref_count: int = 0
    refs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    stats: Optional[Dict[str, int]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "snapshot": self.text,
            "url": self.url,
            "title": self.title,
            "ref_count": self.ref_count,
            "refs": self.refs,
            "stats": self.stats,
        }


@dataclass
class BrowserTab:
    """Represents a browser tab."""

    target_id: str
    title: str
    url: str


class BrowserController:
    """
    Controller for browser automation.

    Manages Playwright browser instances for both user Chrome
    and managed Chromium modes.
    """

    def __init__(self):
        self._runtime = BrowserSessionRuntime()
        self._observation_store = BrowserObservationStore()
        self._action_executor = BrowserActionExecutor(self)
        # Compatibility aliases while controller ownership is decomposed.
        self._ref_registry_by_tab = self._observation_store.ref_registry_by_tab
        self._role_refs_by_tab = self._observation_store.role_refs_by_tab
        self._role_refs_frame_by_tab = self._observation_store.role_refs_frame_by_tab
        self._observed_tabs = self._observation_store.observed_tabs
        self._console_messages_by_tab = self._observation_store.console_messages_by_tab
        self._dialog_events_by_tab = self._observation_store.dialog_events_by_tab
        self._dialog_arms_by_tab = self._observation_store.dialog_arms_by_tab
        self._dialog_waiters_by_tab = self._observation_store.dialog_waiters_by_tab
        self._page_errors_by_tab = self._observation_store.page_errors_by_tab
        self._network_requests_by_tab = self._observation_store.network_requests_by_tab
        self._network_request_id_by_req = self._observation_store.network_request_id_by_req
        self._next_request_id_by_tab = self._observation_store.next_request_id_by_tab
        self._enhanced_cdp_pipeline = EnhancedCdpDomPipeline()

    @property
    def _playwright(self) -> Optional[Playwright]:
        return self._runtime.playwright

    @_playwright.setter
    def _playwright(self, value: Optional[Playwright]) -> None:
        self._runtime.playwright = value

    @property
    def _browser(self) -> Optional[Browser]:
        return self._runtime.browser

    @_browser.setter
    def _browser(self, value: Optional[Browser]) -> None:
        self._runtime.browser = value

    @property
    def _context(self) -> Optional[BrowserContext]:
        return self._runtime.context

    @_context.setter
    def _context(self, value: Optional[BrowserContext]) -> None:
        self._runtime.context = value

    @property
    def _page(self) -> Optional[Page]:
        return self._runtime.page

    @_page.setter
    def _page(self, value: Optional[Page]) -> None:
        self._runtime.page = value

    @property
    def _cdp_url(self) -> Optional[str]:
        return self._runtime.cdp_url

    @_cdp_url.setter
    def _cdp_url(self, value: Optional[str]) -> None:
        self._runtime.cdp_url = value

    @property
    def _mode(self) -> Optional[str]:
        return self._runtime.mode

    @_mode.setter
    def _mode(self, value: Optional[str]) -> None:
        self._runtime.mode = value

    @property
    def _user_data_dir(self) -> Optional[Path]:
        return self._runtime.user_data_dir

    @_user_data_dir.setter
    def _user_data_dir(self, value: Optional[Path]) -> None:
        self._runtime.user_data_dir = value

    @property
    def _browser_process(self) -> object | None:
        return self._runtime.browser_process

    @_browser_process.setter
    def _browser_process(self, value: object | None) -> None:
        self._runtime.browser_process = value

    @property
    def _headless(self) -> bool:
        return self._runtime.headless

    @_headless.setter
    def _headless(self, value: bool) -> None:
        self._runtime.headless = value

    @property
    def _trace_active(self) -> bool:
        return self._runtime.trace_active

    @_trace_active.setter
    def _trace_active(self, value: bool) -> None:
        self._runtime.trace_active = value

    @property
    def is_connected(self) -> bool:
        """Check if browser is connected."""
        return self._runtime.is_connected

    @property
    def current_url(self) -> str:
        """Get current page URL."""
        return self._runtime.current_url

    @property
    def current_title(self) -> str:
        """Get current page title."""
        return self._runtime.current_title

    def _get_target_id(self, page: Optional[Page] = None) -> str:
        p = page or self._page
        return str(id(p)) if p else ""

    def _get_ref_registry(self, page: Optional[Page] = None) -> RefRegistry:
        target_id = self._get_target_id(page)
        if not target_id:
            # Shouldn't happen in normal operation; keep callers simple.
            return RefRegistry()
        return self._observation_store.get_ref_registry(target_id)

    def _reset_ref_registry(self, page: Optional[Page] = None) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.reset_ref_registry(target_id)

    def _record_console_message(self, page: Page, entry: Dict[str, Any]) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.record_console_message(target_id, entry)

    def _record_dialog_event(self, page: Page, entry: Dict[str, Any]) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.record_dialog_event(target_id, entry)

    def _record_page_error(self, page: Page, entry: Dict[str, Any]) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.record_page_error(target_id, entry)

    def _record_network_request(self, page: Page, req: Any) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.record_network_request(
            target_id,
            req,
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "method": req.method,
                "url": req.url,
                "resource_type": req.resource_type,
            },
        )

    def _record_network_response(self, page: Page, response: Any) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.record_network_response(target_id, response)

    def _record_network_request_failed(self, page: Page, req: Any) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.record_network_request_failed(target_id, req)

    async def _handle_dialog_event(self, page: Page, dialog) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return

        arm = self._observation_store.pop_dialog_arm(target_id)
        accept = bool(arm.get("accept", True))
        prompt_text = arm.get("prompt_text")
        handled_as = "dismiss"
        error: Optional[str] = None

        try:
            if accept:
                await dialog.accept(prompt_text)
                handled_as = "accept"
            else:
                await dialog.dismiss()
        except Exception as e:
            error = str(e)

        event: Dict[str, Any] = {
            "type": dialog.type,
            "message": dialog.message,
            "default_value": dialog.default_value,
            "handled_as": handled_as,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        if prompt_text is not None:
            event["prompt_text"] = prompt_text
        if error:
            event["error"] = error

        self._record_dialog_event(page, event)

        self._observation_store.resolve_dialog_waiters(target_id, event)

    def _ensure_page_observers(self, page: Optional[Page]) -> None:
        if not page:
            return

        target_id = self._get_target_id(page)
        if not self._observation_store.mark_observed(target_id):
            return

        def _on_console(msg) -> None:
            try:
                self._record_console_message(
                    page,
                    {
                        "type": msg.type,
                        "text": msg.text,
                        "location": msg.location,
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                )
            except Exception as e:
                logger.debug(f"Failed to record console message: {e}")

        def _on_dialog(dialog) -> None:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self._handle_dialog_event(page, dialog))
            except Exception as e:
                logger.debug(f"Failed to schedule dialog handler: {e}")

        def _on_page_error(err) -> None:
            try:
                self._record_page_error(
                    page,
                    {
                        "message": str(err),
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                )
            except Exception as e:
                logger.debug(f"Failed to record page error: {e}")

        def _on_request(req) -> None:
            try:
                self._record_network_request(page, req)
            except Exception as e:
                logger.debug(f"Failed to record request: {e}")

        def _on_response(response) -> None:
            try:
                self._record_network_response(page, response)
            except Exception as e:
                logger.debug(f"Failed to record response: {e}")

        def _on_request_failed(req) -> None:
            try:
                self._record_network_request_failed(page, req)
            except Exception as e:
                logger.debug(f"Failed to record failed request: {e}")

        on_method = getattr(page, "on", None)
        if not callable(on_method) or inspect.iscoroutinefunction(on_method):
            return

        on_method("console", _on_console)
        on_method("dialog", _on_dialog)
        on_method("pageerror", _on_page_error)
        on_method("request", _on_request)
        on_method("response", _on_response)
        on_method("requestfailed", _on_request_failed)

    def _store_role_refs(
        self,
        refs: Dict[str, RoleRef],
        page: Optional[Page] = None,
        frame_selector: Optional[str] = None,
    ) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        self._observation_store.store_role_refs(
            target_id,
            refs,
            frame_selector=frame_selector,
        )

    def _get_role_ref(self, ref: str, page: Optional[Page] = None) -> Optional[RoleRef]:
        target_id = self._get_target_id(page)
        if not target_id:
            return None
        return self._observation_store.get_role_ref(target_id, ref)

    def _get_role_frame_selector(self, page: Optional[Page] = None) -> Optional[str]:
        target_id = self._get_target_id(page)
        if not target_id:
            return None
        return self._observation_store.get_role_frame_selector(target_id)

    async def auto_connect_to_chrome(
        self,
        cdp_url: str = DEFAULT_WINDIE_CDP_URL,
        auto_launch: bool = True,
        timeout: int = 30,
        headless: bool = False,
    ) -> Dict[str, Any]:
        """
        Auto-connect to WindieOS browser instance, launching if necessary.

        This always targets WindieOS' dedicated browser profile and does not
        interact with the user's default Chrome profile.

        Args:
            cdp_url: Chrome DevTools Protocol URL
            auto_launch: Automatically launch WindieOS browser if not running
            timeout: Connection timeout in seconds
            headless: Run browser without UI when auto-launching

        Returns:
            Connection info dict with 'auto_launched' flag

        Raises:
            ConnectionError: If cannot connect or launch Chrome
        """
        logger.info(
            "Auto-connecting to WindieOS browser at %s (headless=%s)", cdp_url, headless
        )

        # Validate CDP URL
        parsed = urlparse(cdp_url)
        if parsed.hostname not in ("localhost", "127.0.0.1", None):
            raise ValueError("CDP URL must be localhost for security")

        # Extract port from URL
        port = parsed.port or DEFAULT_WINDIE_CDP_PORT

        try:
            was_cdp_available = await is_cdp_available(cdp_url)

            # Use chrome_launcher to ensure Chrome is available
            actual_cdp_url = await ensure_chrome_with_cdp(
                cdp_port=port,
                auto_launch=auto_launch,
                restart_if_needed=False,  # Don't kill user's Chrome without asking
                headless=headless,
            )

            # Now connect via Playwright
            self._playwright = await async_playwright().start()

            self._browser = await self._playwright.chromium.connect_over_cdp(
                actual_cdp_url,
                timeout=timeout * 1000,
            )

            # Get or create context
            contexts = self._browser.contexts
            if contexts:
                self._context = contexts[0]
            else:
                self._context = await self._browser.new_context()

            # Get or create page
            pages = self._context.pages
            if pages:
                self._page = pages[0]
            else:
                self._page = await self._context.new_page()
            for page in self._context.pages:
                self._ensure_page_observers(page)

            self._cdp_url = actual_cdp_url
            self._mode = "user_chrome"
            self._headless = headless
            self._reset_ref_registry(self._page)

            logger.info(f"Connected to Chrome: {self._page.url}")

            return {
                "status": "connected",
                "mode": "user_chrome",
                "url": self._page.url,
                "title": await self._page.title(),
                "auto_launched": not was_cdp_available,
            }

        except ChromeLauncherError as e:
            logger.error(f"Chrome launcher error: {e}")
            await self.close()
            raise ConnectionError(str(e)) from e
        except Exception as e:
            logger.error(f"Failed to connect to Chrome: {e}")
            await self.close()
            raise ConnectionError(
                f"Cannot connect to Chrome at {cdp_url}. " f"Error: {e}"
            ) from e

    async def connect_to_user_chrome(
        self,
        cdp_url: str = DEFAULT_WINDIE_CDP_URL,
        timeout: int = 30,
    ) -> Dict[str, Any]:
        """
        Connect to user's existing Chrome via CDP.

        Args:
            cdp_url: Chrome DevTools Protocol URL
            timeout: Connection timeout in seconds

        Returns:
            Connection info dict

        Raises:
            ConnectionError: If cannot connect to Chrome
        """
        logger.info(f"Connecting to user Chrome at {cdp_url}")

        # Validate CDP URL
        parsed = urlparse(cdp_url)
        if parsed.hostname not in ("localhost", "127.0.0.1", None):
            raise ValueError("CDP URL must be localhost for security")

        try:
            self._playwright = await async_playwright().start()

            # Connect to Chrome via CDP
            self._browser = await self._playwright.chromium.connect_over_cdp(
                cdp_url,
                timeout=timeout * 1000,
            )

            # Get or create context
            contexts = self._browser.contexts
            if contexts:
                self._context = contexts[0]
            else:
                self._context = await self._browser.new_context()

            # Get or create page
            pages = self._context.pages
            if pages:
                self._page = pages[0]
            else:
                self._page = await self._context.new_page()
            for page in self._context.pages:
                self._ensure_page_observers(page)

            self._cdp_url = cdp_url
            self._mode = "user_chrome"
            self._reset_ref_registry(self._page)

            logger.info(f"Connected to Chrome: {self._page.url}")

            return {
                "status": "connected",
                "mode": "user_chrome",
                "url": self._page.url,
                "title": await self._page.title(),
            }

        except Exception as e:
            logger.error(f"Failed to connect to Chrome: {e}")
            await self.close()
            raise ConnectionError(
                f"Cannot connect to Chrome at {cdp_url}. "
                "Make sure the WindieOS browser instance is running with a reachable CDP endpoint."
            ) from e

    async def launch_managed_browser(
        self,
        headless: bool = False,
        executable_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Launch an isolated Chromium instance.

        Args:
            headless: Run browser without UI
            executable_path: Optional path to Chrome executable

        Returns:
            Launch info dict
        """
        logger.info(f"Launching managed browser (headless={headless})")

        # Find Chrome executable if not provided
        if not executable_path:
            exe = find_chrome_executable()
            if not exe:
                raise RuntimeError(
                    "No Chrome/Chromium browser found. "
                    "Please install Chrome or Chromium."
                )
            executable_path = exe.path

        # Create temporary user data directory
        self._user_data_dir = Path(tempfile.mkdtemp(prefix="windieos_browser_"))

        try:
            self._playwright = await async_playwright().start()

            # Playwright requires launch_persistent_context when using a custom
            # profile directory. Passing --user-data-dir to launch() fails.
            launch_args = {
                "headless": headless,
                "executable_path": executable_path,
                "viewport": {"width": 1920, "height": 1080},
                "args": [
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-sync",
                    "--disable-background-networking",
                    "--disable-component-update",
                    "--disable-features=Translate,MediaRouter",
                ],
            }

            if not headless:
                launch_args["args"].append("--start-maximized")

            self._context = await self._playwright.chromium.launch_persistent_context(
                user_data_dir=str(self._user_data_dir),
                **launch_args,
            )
            self._browser = self._context.browser
            pages = self._context.pages
            if pages:
                self._page = pages[0]
            else:
                self._page = await self._context.new_page()
            self._ensure_page_observers(self._page)
            self._mode = "managed"
            self._headless = headless
            self._reset_ref_registry(self._page)

            logger.info(f"Managed browser launched: {self._page.url}")

            return {
                "status": "launched",
                "mode": "managed",
                "url": self._page.url,
                "title": "",
                "executable": executable_path,
            }

        except Exception as e:
            logger.error(f"Failed to launch managed browser: {e}")
            await self.close()
            raise RuntimeError(f"Failed to launch browser: {e}") from e

    async def get_tabs(self) -> List[BrowserTab]:
        """Get list of open tabs."""
        if not self._context:
            return []

        tabs = []
        for page in self._context.pages:
            self._ensure_page_observers(page)
            tabs.append(
                BrowserTab(
                    target_id=str(id(page)),  # Simple ID for now
                    title=await page.title(),
                    url=page.url,
                )
            )
        return tabs

    async def switch_tab(self, target_id: str) -> bool:
        """Switch to a different tab by ID."""
        if not self._context:
            return False

        for page in self._context.pages:
            if str(id(page)) == target_id:
                self._page = page
                self._ensure_page_observers(page)
                _ = self._get_ref_registry(page)
                await page.bring_to_front()
                return True
        return False

    async def navigate(self, url: str, wait_until: str = "load") -> Dict[str, Any]:
        """
        Navigate to a URL.

        Args:
            url: URL to navigate to
            wait_until: When to consider navigation complete
                       (load/domcontentloaded/networkidle/commit)

        Returns:
            Navigation result dict
        """
        if not self._page:
            raise RuntimeError("Browser not connected")

        logger.info(f"Navigating to: {url}")

        try:
            response = await self._page.goto(
                url,
                wait_until=wait_until,  # type: ignore
                timeout=30000,
            )

            # New document -> reset refs for this tab.
            self._reset_ref_registry(self._page)

            return {
                "success": True,
                "url": self._page.url,
                "title": await self._page.title(),
                "status": response.status if response else None,
            }
        except Exception as e:
            logger.error(f"Navigation failed: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def open_tab(
        self, url: str, wait_until: str = "domcontentloaded"
    ) -> Dict[str, Any]:
        """Open a new tab and optionally navigate to a URL."""
        if not self._context:
            raise RuntimeError("Browser not connected")

        try:
            page = await self._context.new_page()
            self._ensure_page_observers(page)
            self._page = page
            response = None
            if url:
                response = await page.goto(
                    url,
                    wait_until=wait_until,  # type: ignore
                    timeout=30000,
                )

            self._reset_ref_registry(page)
            return {
                "success": True,
                "target_id": str(id(page)),
                "url": page.url,
                "title": await page.title(),
                "status": response.status if response else None,
            }
        except Exception as e:
            logger.error(f"Open tab failed: {e}")
            return {"success": False, "error": str(e)}

    async def get_status(self) -> Dict[str, Any]:
        """Get current browser session status."""
        if not self.is_connected:
            return {
                "connected": False,
                "mode": self._mode,
                "url": "",
                "title": "",
                "tab_count": len(self._context.pages) if self._context else 0,
            }

        assert self._page is not None
        return {
            "connected": True,
            "mode": self._mode,
            "url": self._page.url,
            "title": await self._page.title(),
            "tab_count": len(self._context.pages) if self._context else 0,
            "target_id": str(id(self._page)),
        }

    def get_console_messages(
        self,
        *,
        level: Optional[str] = None,
        limit: int = 100,
        clear: bool = False,
    ) -> List[Dict[str, Any]]:
        """Get console messages for the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return []

        return self._observation_store.get_console_messages(
            target_id,
            level=level,
            limit=limit,
            clear=clear,
        )

    def arm_dialog(
        self,
        *,
        accept: bool = True,
        prompt_text: Optional[str] = None,
    ) -> None:
        """Arm handling for the next dialog in the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return
        self._observation_store.arm_dialog(
            target_id,
            accept=accept,
            prompt_text=prompt_text,
        )

    async def wait_for_dialog(
        self, timeout_ms: int = 10000
    ) -> Optional[Dict[str, Any]]:
        """Wait for next dialog event in the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return None

        loop = asyncio.get_running_loop()
        waiter: asyncio.Future = loop.create_future()
        self._observation_store.add_dialog_waiter(target_id, waiter)
        try:
            result = await asyncio.wait_for(waiter, timeout=max(1, timeout_ms) / 1000.0)
            return result if isinstance(result, dict) else None
        except asyncio.TimeoutError:
            return None
        finally:
            self._observation_store.prune_dialog_waiter(target_id, waiter)

    def get_dialog_events(
        self, limit: int = 20, clear: bool = False
    ) -> List[Dict[str, Any]]:
        """Get recent handled dialog events for the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return []

        return self._observation_store.get_dialog_events(
            target_id,
            limit=limit,
            clear=clear,
        )

    def get_page_errors(
        self, limit: int = 100, clear: bool = False
    ) -> List[Dict[str, Any]]:
        """Get captured page errors for the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return []

        return self._observation_store.get_page_errors(
            target_id,
            limit=limit,
            clear=clear,
        )

    def get_network_requests(
        self,
        *,
        limit: int = 100,
        contains: Optional[str] = None,
        clear: bool = False,
    ) -> List[Dict[str, Any]]:
        """Get captured network requests for the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return []

        return self._observation_store.get_network_requests(
            target_id,
            limit=limit,
            contains=contains,
            clear=clear,
        )

    async def trace_start(
        self, *, snapshots: bool = True, screenshots: bool = True, sources: bool = True
    ) -> Dict[str, Any]:
        """Start Playwright tracing for current context."""
        return await self._action_executor.trace_start(
            snapshots=snapshots,
            screenshots=screenshots,
            sources=sources,
        )

    async def trace_stop(self) -> Dict[str, Any]:
        """Stop Playwright tracing and return trace zip bytes."""
        return await self._action_executor.trace_stop()

    async def get_cookies(self) -> List[Dict[str, Any]]:
        """Get cookies for current context."""
        return await self._action_executor.get_cookies()

    async def set_cookies(self, cookies: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Set cookies in current context."""
        return await self._action_executor.set_cookies(cookies)

    async def clear_cookies(self) -> Dict[str, Any]:
        """Clear cookies in current context."""
        return await self._action_executor.clear_cookies()

    async def get_storage(self, kind: str) -> Dict[str, str]:
        """Get localStorage/sessionStorage key-values for current page."""
        return await self._action_executor.get_storage(kind)

    async def set_storage(self, kind: str, values: Dict[str, str]) -> Dict[str, Any]:
        """Set localStorage/sessionStorage values for current page."""
        return await self._action_executor.set_storage(kind, values)

    async def clear_storage(self, kind: str) -> Dict[str, Any]:
        """Clear localStorage/sessionStorage for current page."""
        return await self._action_executor.clear_storage(kind)

    async def set_offline(self, offline: bool) -> Dict[str, Any]:
        """Set context offline mode."""
        return await self._action_executor.set_offline(offline)

    async def set_headers(self, headers: Dict[str, str]) -> Dict[str, Any]:
        """Set extra HTTP headers for context."""
        return await self._action_executor.set_headers(headers)

    async def set_http_credentials(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        clear: bool = False,
    ) -> Dict[str, Any]:
        """Set or clear HTTP basic auth credentials."""
        return await self._action_executor.set_http_credentials(
            username=username,
            password=password,
            clear=clear,
        )

    async def set_geolocation(
        self,
        *,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        accuracy: Optional[float] = None,
        clear: bool = False,
    ) -> Dict[str, Any]:
        """Set or clear context geolocation."""
        return await self._action_executor.set_geolocation(
            latitude=latitude,
            longitude=longitude,
            accuracy=accuracy,
            clear=clear,
        )

    async def set_media(
        self, media: Optional[str] = None, color_scheme: Optional[str] = None
    ) -> Dict[str, Any]:
        """Emulate media settings on current page."""
        return await self._action_executor.set_media(
            media=media,
            color_scheme=color_scheme,
        )

    async def set_timezone(self, timezone: str) -> Dict[str, Any]:
        """
        Set timezone for current context.

        Playwright requires timezone at context creation time; this is not mutable at runtime.
        """
        return await self._action_executor.set_timezone(timezone)

    async def set_locale(self, locale: str) -> Dict[str, Any]:
        """
        Set locale for current context.

        Playwright requires locale at context creation time; this is not mutable at runtime.
        """
        return await self._action_executor.set_locale(locale)

    async def set_device(self, device: str) -> Dict[str, Any]:
        """
        Apply a device preset best-effort.

        This currently supports viewport changes for common presets.
        """
        return await self._action_executor.set_device(device)

    async def get_page_snapshot(
        self,
        format_type: str = "ai",
        max_chars: int = 80000,
        refs_mode: Optional[str] = None,
        interactive: Optional[bool] = None,
        compact: Optional[bool] = None,
        depth: Optional[int] = None,
        selector: Optional[str] = None,
        frame_selector: Optional[str] = None,
    ) -> PageSnapshot:
        """
        Get page snapshot for LLM consumption.

        Args:
            format_type:
                - "ai": Interactive refs + optional role-based contextual snapshot.
                - "aria": Accessibility tree snapshot (no refs).
            max_chars: Maximum characters in snapshot

        Returns:
            PageSnapshot object
        """
        if not self._page:
            raise RuntimeError("Browser not connected")

        if format_type == "aria":
            return await self._get_aria_snapshot(max_chars=max_chars)

        wants_role_snapshot = (
            refs_mode in ("role", "aria")
            or interactive is True
            or compact is True
            or depth is not None
            or bool((selector or "").strip())
            or bool((frame_selector or "").strip())
        )
        if wants_role_snapshot:
            return await self._get_role_snapshot(
                max_chars=max_chars,
                refs_mode=refs_mode,
                interactive=interactive,
                compact=compact,
                depth=depth,
                selector=selector,
                frame_selector=frame_selector,
            )
        return await self._get_ai_snapshot(max_chars)

    async def _get_ai_snapshot(self, max_chars: int = 12000) -> PageSnapshot:
        """Build a browser-use-like interactive DOM snapshot with stable-ish refs."""
        reg = self._get_ref_registry(self._page)
        max_elements = 100

        try:
            enhanced = await self._enhanced_cdp_pipeline.build_ai_snapshot(
                page=self._page,
                max_chars=max_chars,
                max_elements=max_elements,
                ref_registry=reg,
                build_element_key=self._build_element_key,
            )
            return PageSnapshot(
                text=enhanced.text,
                url=enhanced.url,
                title=enhanced.title,
                ref_count=enhanced.ref_count,
            )
        except Exception as e:
            logger.warning(
                "Enhanced CDP snapshot failed, falling back to legacy snapshot path: %s",
                e,
            )
            return await self._get_ai_snapshot_legacy(max_chars=max_chars)

    async def _get_ai_snapshot_legacy(self, max_chars: int = 12000) -> PageSnapshot:
        """Legacy query-selector snapshot path used when CDP pipeline is unavailable."""
        title = await self._page.title()
        url = self._page.url
        reg = self._get_ref_registry(self._page)

        # Query interactive elements
        elements = await self._page.query_selector_all(
            'button, input, textarea, select, a, [role="button"], '
            '[role="link"], [role="textbox"], [role="checkbox"], '
            '[role="radio"], [role="combobox"], [role="searchbox"]'
        )

        lines: list[str] = []
        emitted_paths: set[tuple[str, ...]] = set()
        seen_refs: set[str] = set()
        max_elements = 100

        for elem in elements:
            try:
                if len(seen_refs) >= max_elements:
                    break

                info = await elem.evaluate(
                    """
                    (el) => {
                      const tag = (el.tagName || "").toLowerCase();
                      const attr = (n) => el.getAttribute(n) || "";
                      const role = attr("role");
                      const type = attr("type");
                      const id = el.id || "";
                      const nameAttr = attr("name");
                      const placeholder = attr("placeholder");
                      const href = tag === "a" ? (attr("href") || "") : "";

                      const ariaLabel = attr("aria-label");
                      const title = attr("title");
                      const alt = attr("alt");

                      let label = (ariaLabel || title || nameAttr || placeholder || alt || "").trim();
                      if (!label) {
                        const text = (el.innerText || el.textContent || "").trim();
                        label = text;
                      }
                      if (label.length > 80) label = label.slice(0, 80);

                      const style = window.getComputedStyle(el);
                      const rect = el.getBoundingClientRect();
                      const visible =
                        style &&
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        style.opacity !== "0" &&
                        rect.width > 0 &&
                        rect.height > 0;

                      const interesting = new Set(["form","main","nav","header","footer","section","article","aside","dialog"]);
                      const ancestors = [];
                      let p = el.parentElement;
                      while (p && ancestors.length < 4) {
                        const ptag = (p.tagName || "").toLowerCase();
                        const pid = p.id || "";
                        const pclass = (p.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean)[0] || "";
                        if (interesting.has(ptag) || pid) {
                          let label = ptag;
                          if (pid) label += `#${pid}`;
                          else if (pclass && (ptag === "div" || ptag === "section")) label += `.${pclass}`;
                          ancestors.unshift(label);
                        }
                        p = p.parentElement;
                      }

                      return { tag, role, type, id, nameAttr, placeholder, href, label, visible, ancestors };
                    }
                    """
                )

                if not isinstance(info, dict) or not info.get("visible"):
                    continue

                tag = str(info.get("tag") or "")
                role = str(info.get("role") or "")
                elem_type = str(info.get("type") or "")
                placeholder = str(info.get("placeholder") or "")
                name = str(info.get("label") or "")

                key = self._build_element_key(info)
                ref, is_new = reg.assign(key=key, url=url)

                # Attach ref for later interactions. Don't use aria-* namespace.
                await elem.evaluate(
                    "(el, ref) => el.setAttribute('data-windie-ref', ref)",
                    ref,
                )

                # Emit stable ancestor scaffolding to create a readable DOM-like tree.
                ancestors = info.get("ancestors") or []
                normalized_ancestors: list[str] = []
                if isinstance(ancestors, list):
                    for anc in ancestors[:4]:
                        anc_str = str(anc).strip()
                        if anc_str:
                            normalized_ancestors.append(anc_str)

                for depth_idx in range(len(normalized_ancestors)):
                    path = tuple(normalized_ancestors[: depth_idx + 1])
                    if path in emitted_paths:
                        continue
                    emitted_paths.add(path)
                    ancestor_label = normalized_ancestors[depth_idx]
                    indent = "\t" * depth_idx
                    lines.append(f"{indent}<{ancestor_label}>")

                line = self._build_interactive_snapshot_line(
                    ref=ref,
                    is_new=is_new,
                    tag=tag,
                    role=role,
                    elem_type=elem_type,
                    name=name,
                    placeholder=placeholder,
                    href=str(info.get("href") or ""),
                )
                if line:
                    indent = "\t" * len(normalized_ancestors)
                    lines.append(f"{indent}{line}")
                    seen_refs.add(ref)
            except Exception as e:
                logger.debug(f"Error processing element: {e}")
                continue

        reg.finalize_snapshot(seen_refs=seen_refs, url=url)

        # Build snapshot text
        snapshot_text = f"Title: {title}\nURL: {url}\n\n"
        snapshot_text += "DOM tree (interactive snapshot):\n"
        snapshot_text += "\n".join(lines) if lines else "(none found)"

        # Truncate if too long
        if len(snapshot_text) > max_chars:
            snapshot_text = snapshot_text[:max_chars] + "\n... (truncated)"

        return PageSnapshot(
            text=snapshot_text,
            url=url,
            title=title,
            ref_count=len(seen_refs),
        )

    def _build_interactive_snapshot_line(
        self,
        *,
        ref: str,
        is_new: bool,
        tag: str,
        role: str,
        elem_type: str,
        name: str,
        placeholder: str,
        href: str,
    ) -> str:
        """Format an interactive snapshot line with lightweight tag attrs."""
        tag_name = (tag or "element").strip().lower() or "element"
        label = (name or placeholder or "").strip()
        if len(label) > 80:
            label = label[:80]

        attrs: list[str] = []
        if role:
            attrs.append(f"role='{role}'")
        if elem_type:
            attrs.append(f"type='{elem_type}'")
        if href:
            trimmed_href = href[:200]
            attrs.append(f"href='{trimmed_href}'")

        attrs_text = f" {' '.join(attrs)}" if attrs else ""
        content_text = label or ""
        prefix = "*[" if is_new else "["
        return f"{prefix}{ref}]<{tag_name}{attrs_text}>{content_text}</{tag_name}>"

    def _build_element_key(self, info: Dict[str, Any]) -> str:
        """
        Build a key used for stable ref assignment.

        Best-effort heuristic: prefer semantic attributes over DOM position.
        """
        parts: list[str] = []
        # Prefer stable identifiers first.
        for k in ("tag", "role", "type", "id", "nameAttr", "href", "placeholder"):
            v = info.get(k)
            if not v:
                continue
            vs = str(v).strip()
            if not vs:
                continue
            if len(vs) > 160:
                vs = vs[:160]
            parts.append(f"{k}={vs}")

        # Only use the human label when we don't have stronger identifiers.
        if not any(info.get(k) for k in ("id", "nameAttr", "href")):
            v = info.get("label")
            if v:
                vs = str(v).strip()
                if vs:
                    if len(vs) > 160:
                        vs = vs[:160]
                    parts.append(f"label={vs}")
        ancestors = info.get("ancestors") or []
        if isinstance(ancestors, list) and ancestors:
            anc_str = "/".join(str(a) for a in ancestors[:4])
            parts.append(f"anc={anc_str}")
        return "|".join(parts)

    async def _get_role_snapshot(
        self,
        *,
        max_chars: int = 12000,
        refs_mode: Optional[str] = None,
        interactive: Optional[bool] = None,
        compact: Optional[bool] = None,
        depth: Optional[int] = None,
        selector: Optional[str] = None,
        frame_selector: Optional[str] = None,
    ) -> PageSnapshot:
        """
        Build a role snapshot with OpenClaw semantics.

        This path adds `eN` refs and supports:
        - interactive-only output
        - compact structural pruning
        - depth limits
        - selector/frame scoping
        """
        title = await self._page.title()
        url = self._page.url
        refs_mode = "aria" if refs_mode == "aria" else "role"
        selector = (selector or "").strip()
        frame_selector = (frame_selector or "").strip()

        if frame_selector:
            base_locator = self._page.frame_locator(frame_selector)
            locator = base_locator.locator(selector or ":root")
        else:
            locator = self._page.locator(selector or ":root")

        raw_snapshot = await locator.aria_snapshot()
        built_snapshot, refs = build_role_snapshot_from_aria_snapshot(
            str(raw_snapshot or ""),
            RoleSnapshotOptions(
                interactive=interactive,
                compact=compact,
                max_depth=depth,
            ),
        )

        self._store_role_refs(
            refs=refs,
            page=self._page,
            frame_selector=frame_selector or None,
        )

        body_text = built_snapshot
        if max_chars > 0 and len(body_text) > max_chars:
            body_text = body_text[:max_chars] + "\n... (truncated)"

        snapshot_text = f"Title: {title}\nURL: {url}\n\n{body_text}"
        refs_dict: Dict[str, Dict[str, Any]] = {
            key: {
                "role": value.role,
                **({"name": value.name} if value.name else {}),
                **({"nth": value.nth} if value.nth is not None else {}),
            }
            for key, value in refs.items()
        }
        stats = get_role_snapshot_stats(built_snapshot, refs)

        # refs=aria keeps role snapshot structure but reuses numeric refs for direct actions.
        if refs_mode == "aria":
            logger.debug(
                "refs=aria requested; using role refs due sidecar aria-ref limitations"
            )

        return PageSnapshot(
            text=snapshot_text,
            url=url,
            title=title,
            ref_count=len(refs),
            refs=refs_dict,
            stats={
                "lines": stats.lines,
                "chars": stats.chars,
                "refs": stats.refs,
                "interactive": stats.interactive,
            },
        )

    async def _get_aria_snapshot(self, max_chars: int = 4000) -> PageSnapshot:
        """Build accessibility tree snapshot."""
        title = await self._page.title()
        url = self._page.url

        # Playwright Python now exposes aria snapshot on Locator instead of
        # Page.accessibility.
        raw_snapshot = await self._page.locator(":root").aria_snapshot()
        body_text = str(raw_snapshot or "")
        snapshot_text = f"Title: {title}\nURL: {url}\n\nAccessibility Tree:\n"
        snapshot_text += body_text
        if max_chars > 0 and len(snapshot_text) > max_chars:
            suffix = "\n... (truncated)"
            if max_chars <= len(suffix):
                snapshot_text = snapshot_text[:max_chars]
            else:
                snapshot_text = snapshot_text[: max_chars - len(suffix)] + suffix

        return PageSnapshot(
            text=snapshot_text,
            url=url,
            title=title,
            ref_count=0,
        )

    async def _get_element_name(self, elem) -> str:
        """Extract human-readable name from element."""
        # Try different attributes for name
        for attr in ["aria-label", "title", "name", "value", "alt", "textContent"]:
            if attr == "textContent":
                text = await elem.text_content()
                if text:
                    return text.strip()[:50]
            else:
                val = await elem.get_attribute(attr)
                if val:
                    return val.strip()[:50]
        return ""

    def _describe_element(
        self,
        tag: str,
        role: str,
        elem_type: str,
        name: str,
        placeholder: str,
    ) -> str:
        """Build human-readable element description."""
        parts = []

        # Determine element type
        if role:
            parts.append(role)
        elif tag == "input":
            parts.append(elem_type or "input")
        elif tag in ["button", "a", "select", "textarea"]:
            parts.append(tag)
        else:
            parts.append(tag)

        # Add name/label
        display_name = name or placeholder
        if display_name:
            parts.append(f'"{display_name}"')

        return " ".join(parts) if parts else ""

    def _resolve_ref_locator(self, ref: str):
        """Resolve both numeric refs and role refs (e.g., e12)."""
        return self._action_executor._resolve_ref_locator(ref)

    async def _resolve_click_locator(self, ref: str) -> tuple[Any, Dict[str, Any]]:
        """
        Resolve locator for click operations.

        For role refs without explicit nth, resolve to one deterministic visible
        candidate or fail with an ambiguity error. This avoids oscillating auto-scroll
        retries across duplicate controls (e.g., sticky headers/footers/carousels).
        """
        return await self._action_executor._resolve_click_locator(ref)

    @staticmethod
    def _is_recoverable_click_error(error_text: str) -> bool:
        return BrowserActionExecutor._is_recoverable_click_error(error_text)

    async def _try_select_option_click_fallback(
        self,
        locator: Any,
        *,
        ref: str,
        resolution_meta: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        For native select controls, use select_option before force-click.

        This avoids pointer-interception issues on pages that style the select
        control with overlay elements (for example Amazon sort dropdowns).
        """
        return await self._action_executor._try_select_option_click_fallback(
            locator,
            ref=ref,
            resolution_meta=resolution_meta,
        )

    async def click(
        self,
        ref: str,
        double_click: bool = False,
        button: str = "left",
    ) -> Dict[str, Any]:
        """Click an element by reference."""
        return await self._action_executor.click(
            ref,
            double_click=double_click,
            button=button,
        )

    async def click_coordinates(
        self,
        x: int,
        y: int,
        double_click: bool = False,
        button: str = "left",
    ) -> Dict[str, Any]:
        """Click absolute viewport coordinates."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            if double_click:
                await self._page.mouse.dblclick(x, y, button=button)
                strategy = "coordinate_dblclick"
            else:
                await self._page.mouse.click(x, y, button=button)
                strategy = "coordinate_click"
            return {
                "success": True,
                "action": "click",
                "coordinate_x": x,
                "coordinate_y": y,
                "button": button,
                "strategy": strategy,
            }
        except Exception as e:
            logger.error(f"Coordinate click failed: {e}")
            return {"success": False, "error": str(e)}

    async def type_text(
        self,
        ref: str,
        text: str,
        submit: bool = False,
        clear_first: bool = True,
    ) -> Dict[str, Any]:
        """Type text into an element."""
        return await self._action_executor.type_text(
            ref,
            text,
            submit=submit,
            clear_first=clear_first,
        )

    async def press_key(self, key: str) -> Dict[str, Any]:
        """Press a keyboard key."""
        return await self._action_executor.press_key(key)

    async def scroll(
        self,
        direction: str = "down",
        amount: int = 500,
    ) -> Dict[str, Any]:
        """Scroll the page."""
        return await self._action_executor.scroll(direction=direction, amount=amount)

    async def screenshot(
        self,
        full_page: bool = False,
        ref: Optional[str] = None,
        element: Optional[str] = None,
        image_type: str = "png",
        quality: Optional[int] = None,
    ) -> bytes:
        """
        Take a screenshot.

        Args:
            full_page: Capture full page height
            ref: Optional element reference to screenshot
            element: Optional CSS selector to screenshot
            image_type: "png" or "jpeg"
            quality: JPEG quality (1-100)

        Returns:
            Image bytes
        """
        return await self._action_executor.screenshot(
            full_page=full_page,
            ref=ref,
            element=element,
            image_type=image_type,
            quality=quality,
        )

    async def pdf(self) -> bytes:
        """Create a PDF of the current page."""
        return await self._action_executor.pdf()

    async def hover(self, ref: str) -> Dict[str, Any]:
        """Hover on an element by reference."""
        return await self._action_executor.hover(ref)

    async def drag(self, start_ref: str, end_ref: str) -> Dict[str, Any]:
        """Drag from one referenced element to another."""
        return await self._action_executor.drag(start_ref, end_ref)

    async def select_options(self, ref: str, values: List[str]) -> Dict[str, Any]:
        """Select options in a <select> element by reference."""
        return await self._action_executor.select_options(ref, values)

    async def get_dropdown_options(self, ref: str) -> Dict[str, Any]:
        """List options for a dropdown-like element resolved by reference."""
        return await self._action_executor.get_dropdown_options(ref)

    async def select_dropdown(self, ref: str, text: str) -> Dict[str, Any]:
        """Select an option by visible text or value for a referenced dropdown."""
        return await self._action_executor.select_dropdown(ref, text)

    async def set_input_files(self, ref: str, paths: List[str]) -> Dict[str, Any]:
        """Set file input files by reference."""
        return await self._action_executor.set_input_files(ref, paths)

    async def fill_fields(self, fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Fill multiple fields by ref."""
        return await self._action_executor.fill_fields(fields)

    async def resize_viewport(self, width: int, height: int) -> Dict[str, Any]:
        """Resize viewport dimensions."""
        return await self._action_executor.resize_viewport(width, height)

    async def wait_for_load(
        self,
        state: str = "networkidle",
        timeout: int = 30000,
    ) -> Dict[str, Any]:
        """Wait for page to reach a load state."""
        return await self._action_executor.wait_for_load(
            state=state,
            timeout=timeout,
        )

    async def evaluate(self, script: str) -> Any:
        """Evaluate JavaScript in the page."""
        return await self._action_executor.evaluate(script)

    async def close(self) -> None:
        """Close browser connection and cleanup."""
        logger.info("Closing browser controller")

        try:
            if self._browser:
                await self._browser.close()
                self._browser = None

            if self._playwright:
                await self._playwright.stop()
                self._playwright = None

            # Cleanup temp user data dir for managed browser
            if self._user_data_dir and self._user_data_dir.exists():
                import shutil

                try:
                    shutil.rmtree(self._user_data_dir)
                except Exception as e:
                    logger.warning(f"Failed to cleanup user data dir: {e}")

            self._observation_store.reset()
            self._network_request_id_by_req = self._observation_store.network_request_id_by_req
            self._runtime.reset()

        except Exception as e:
            logger.error(f"Error during browser close: {e}")


# Singleton instance for session reuse
_browser_controller: Optional[BrowserController] = None


def get_browser_controller() -> BrowserController:
    """Get or create singleton browser controller."""
    global _browser_controller
    if _browser_controller is None:
        _browser_controller = BrowserController()
    return _browser_controller


def reset_browser_controller() -> None:
    """Reset singleton instance (for testing)."""
    global _browser_controller
    _browser_controller = None
