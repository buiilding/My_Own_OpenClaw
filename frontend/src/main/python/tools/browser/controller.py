"""
Browser controller for web automation via Playwright.

Supports two modes:
1. User's Chrome: Connect to existing Chrome via CDP
2. Managed Chromium: Launch isolated browser instance
"""

import logging
import inspect
import tempfile
import asyncio
from weakref import WeakKeyDictionary
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, Set
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
    ensure_chrome_with_cdp,
    ChromeLauncherError,
)
from tools.browser.enhanced_cdp_pipeline import EnhancedCdpDomPipeline
from tools.browser.ref_registry import RefRegistry
from tools.browser.role_snapshot import (
    RoleRef,
    RoleSnapshotOptions,
    build_role_snapshot_from_aria_snapshot,
    get_role_snapshot_stats,
    parse_role_ref,
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
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._cdp_url: Optional[str] = None
        self._mode: Optional[str] = None  # "user_chrome" or "managed"
        self._user_data_dir: Optional[Path] = None
        self._browser_process = None
        # Per-tab ref registries keyed by target_id (currently str(id(Page))).
        self._ref_registry_by_tab: Dict[str, RefRegistry] = {}
        # Per-tab role refs from role snapshots (e.g., e1/e2), with optional iframe scope.
        self._role_refs_by_tab: Dict[str, Dict[str, RoleRef]] = {}
        self._role_refs_frame_by_tab: Dict[str, Optional[str]] = {}
        self._observed_tabs: Set[str] = set()
        self._console_messages_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self._dialog_events_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self._dialog_arms_by_tab: Dict[str, Dict[str, Any]] = {}
        self._dialog_waiters_by_tab: Dict[str, List[asyncio.Future]] = {}
        self._page_errors_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self._network_requests_by_tab: Dict[str, List[Dict[str, Any]]] = {}
        self._network_request_id_by_req: WeakKeyDictionary = WeakKeyDictionary()
        self._next_request_id_by_tab: Dict[str, int] = {}
        self._trace_active: bool = False
        self._enhanced_cdp_pipeline = EnhancedCdpDomPipeline()

    @property
    def is_connected(self) -> bool:
        """Check if browser is connected."""
        return self._context is not None and self._page is not None

    @property
    def current_url(self) -> str:
        """Get current page URL."""
        if self._page:
            return self._page.url
        return ""

    @property
    def current_title(self) -> str:
        """Get current page title."""
        if self._page:
            # Async Playwright exposes title() as a coroutine; keep this sync
            # property safe and let callers that need accurate title await get_status().
            title_attr = getattr(self._page, "title", None)
            return title_attr if isinstance(title_attr, str) else ""
        return ""

    def _get_target_id(self, page: Optional[Page] = None) -> str:
        p = page or self._page
        return str(id(p)) if p else ""

    def _get_ref_registry(self, page: Optional[Page] = None) -> RefRegistry:
        target_id = self._get_target_id(page)
        if not target_id:
            # Shouldn't happen in normal operation; keep callers simple.
            return RefRegistry()
        reg = self._ref_registry_by_tab.get(target_id)
        if reg is None:
            reg = RefRegistry()
            self._ref_registry_by_tab[target_id] = reg
        return reg

    def _reset_ref_registry(self, page: Optional[Page] = None) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        reg = self._ref_registry_by_tab.get(target_id)
        if reg is None:
            reg = RefRegistry()
            self._ref_registry_by_tab[target_id] = reg
        reg.reset()
        self._role_refs_by_tab.pop(target_id, None)
        self._role_refs_frame_by_tab.pop(target_id, None)

    def _record_console_message(self, page: Page, entry: Dict[str, Any]) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        messages = self._console_messages_by_tab.setdefault(target_id, [])
        messages.append(entry)
        if len(messages) > 500:
            del messages[0 : len(messages) - 500]

    def _record_dialog_event(self, page: Page, entry: Dict[str, Any]) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        events = self._dialog_events_by_tab.setdefault(target_id, [])
        events.append(entry)
        if len(events) > 100:
            del events[0 : len(events) - 100]

    def _record_page_error(self, page: Page, entry: Dict[str, Any]) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        errors = self._page_errors_by_tab.setdefault(target_id, [])
        errors.append(entry)
        if len(errors) > 200:
            del errors[0 : len(errors) - 200]

    def _record_network_request(self, page: Page, req: Any) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return

        next_id = self._next_request_id_by_tab.get(target_id, 0) + 1
        self._next_request_id_by_tab[target_id] = next_id
        req_id = f"r{next_id}"
        self._network_request_id_by_req[req] = req_id

        records = self._network_requests_by_tab.setdefault(target_id, [])
        records.append(
            {
                "id": req_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "method": req.method,
                "url": req.url,
                "resource_type": req.resource_type,
            }
        )
        if len(records) > 500:
            del records[0 : len(records) - 500]

    def _record_network_response(self, page: Page, response: Any) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        req = response.request
        req_id = self._network_request_id_by_req.get(req)
        if not req_id:
            return
        records = self._network_requests_by_tab.get(target_id, [])
        for record in reversed(records):
            if record.get("id") == req_id:
                record["status"] = response.status
                record["ok"] = response.ok
                break

    def _record_network_request_failed(self, page: Page, req: Any) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return
        req_id = self._network_request_id_by_req.get(req)
        if not req_id:
            return
        records = self._network_requests_by_tab.get(target_id, [])
        failure_text = None
        try:
            failure = req.failure
            failure_text = (
                failure.get("errorText") if isinstance(failure, dict) else None
            )
        except Exception:
            failure_text = None
        for record in reversed(records):
            if record.get("id") == req_id:
                record["failure_text"] = failure_text or "request failed"
                record["ok"] = False
                break

    async def _handle_dialog_event(self, page: Page, dialog) -> None:
        target_id = self._get_target_id(page)
        if not target_id:
            return

        arm = self._dialog_arms_by_tab.pop(
            target_id,
            {"accept": True, "prompt_text": None},
        )
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

        waiters = self._dialog_waiters_by_tab.get(target_id, [])
        for waiter in waiters:
            if waiter.done():
                continue
            waiter.set_result(event)
        self._dialog_waiters_by_tab[target_id] = [w for w in waiters if not w.done()]

    def _ensure_page_observers(self, page: Optional[Page]) -> None:
        if not page:
            return

        target_id = self._get_target_id(page)
        if not target_id or target_id in self._observed_tabs:
            return

        self._observed_tabs.add(target_id)

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
        self._role_refs_by_tab[target_id] = refs
        self._role_refs_frame_by_tab[target_id] = frame_selector

    def _get_role_ref(self, ref: str, page: Optional[Page] = None) -> Optional[RoleRef]:
        target_id = self._get_target_id(page)
        if not target_id:
            return None
        refs = self._role_refs_by_tab.get(target_id)
        if not refs:
            return None
        return refs.get(ref)

    def _get_role_frame_selector(self, page: Optional[Page] = None) -> Optional[str]:
        target_id = self._get_target_id(page)
        if not target_id:
            return None
        return self._role_refs_frame_by_tab.get(target_id)

    async def auto_connect_to_chrome(
        self,
        cdp_url: str = "http://127.0.0.1:9222",
        auto_launch: bool = True,
        timeout: int = 30,
    ) -> Dict[str, Any]:
        """
        Auto-connect to Chrome, launching if necessary.

        This is the recommended method for connecting to user's Chrome.
        It handles all scenarios:
        1. Chrome already running with CDP → connect to it
        2. Chrome not running → launch it with CDP
        3. Chrome running without CDP → restart with CDP (if allowed)

        Args:
            cdp_url: Chrome DevTools Protocol URL
            auto_launch: Automatically launch Chrome if not running
            timeout: Connection timeout in seconds

        Returns:
            Connection info dict with 'auto_launched' flag

        Raises:
            ConnectionError: If cannot connect or launch Chrome
        """
        logger.info(f"Auto-connecting to Chrome at {cdp_url}")

        # Validate CDP URL
        parsed = urlparse(cdp_url)
        if parsed.hostname not in ("localhost", "127.0.0.1", None):
            raise ValueError("CDP URL must be localhost for security")

        # Extract port from URL
        port = parsed.port or 9222

        try:
            # Use chrome_launcher to ensure Chrome is available
            actual_cdp_url = await ensure_chrome_with_cdp(
                cdp_port=port,
                auto_launch=auto_launch,
                restart_if_needed=False,  # Don't kill user's Chrome without asking
                headless=False,
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
            self._reset_ref_registry(self._page)

            logger.info(f"Connected to Chrome: {self._page.url}")

            return {
                "status": "connected",
                "mode": "user_chrome",
                "url": self._page.url,
                "title": await self._page.title(),
                "auto_launched": True,  # Chrome was auto-launched if needed
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
        cdp_url: str = "http://127.0.0.1:9222",
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
                "Make sure Chrome is running with --remote-debugging-port=9222"
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

        messages = list(self._console_messages_by_tab.get(target_id, []))
        if level:
            lvl = level.lower()
            messages = [m for m in messages if str(m.get("type", "")).lower() == lvl]

        if limit > 0:
            messages = messages[-limit:]

        if clear:
            self._console_messages_by_tab[target_id] = []

        return messages

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
        self._dialog_arms_by_tab[target_id] = {
            "accept": accept,
            "prompt_text": prompt_text,
        }

    async def wait_for_dialog(
        self, timeout_ms: int = 10000
    ) -> Optional[Dict[str, Any]]:
        """Wait for next dialog event in the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return None

        loop = asyncio.get_running_loop()
        waiter: asyncio.Future = loop.create_future()
        self._dialog_waiters_by_tab.setdefault(target_id, []).append(waiter)
        try:
            result = await asyncio.wait_for(waiter, timeout=max(1, timeout_ms) / 1000.0)
            return result if isinstance(result, dict) else None
        except asyncio.TimeoutError:
            return None
        finally:
            waiters = self._dialog_waiters_by_tab.get(target_id, [])
            self._dialog_waiters_by_tab[target_id] = [
                w for w in waiters if w is not waiter
            ]

    def get_dialog_events(
        self, limit: int = 20, clear: bool = False
    ) -> List[Dict[str, Any]]:
        """Get recent handled dialog events for the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return []

        events = list(self._dialog_events_by_tab.get(target_id, []))
        if limit > 0:
            events = events[-limit:]

        if clear:
            self._dialog_events_by_tab[target_id] = []

        return events

    def get_page_errors(
        self, limit: int = 100, clear: bool = False
    ) -> List[Dict[str, Any]]:
        """Get captured page errors for the active tab."""
        target_id = self._get_target_id(self._page)
        if not target_id:
            return []

        errors = list(self._page_errors_by_tab.get(target_id, []))
        if limit > 0:
            errors = errors[-limit:]

        if clear:
            self._page_errors_by_tab[target_id] = []

        return errors

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

        requests = list(self._network_requests_by_tab.get(target_id, []))
        if contains:
            needle = contains.lower()
            requests = [
                r
                for r in requests
                if needle in str(r.get("url", "")).lower()
                or needle in str(r.get("method", "")).lower()
            ]
        if limit > 0:
            requests = requests[-limit:]

        if clear:
            self._network_requests_by_tab[target_id] = []

        return requests

    async def trace_start(
        self, *, snapshots: bool = True, screenshots: bool = True, sources: bool = True
    ) -> Dict[str, Any]:
        """Start Playwright tracing for current context."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        if self._trace_active:
            return {"success": False, "error": "Trace already active"}
        try:
            await self._context.tracing.start(
                snapshots=snapshots,
                screenshots=screenshots,
                sources=sources,
            )
            self._trace_active = True
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def trace_stop(self) -> Dict[str, Any]:
        """Stop Playwright tracing and return trace zip bytes."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        if not self._trace_active:
            return {"success": False, "error": "Trace is not active"}
        trace_path = Path(tempfile.mkdtemp(prefix="windieos_trace_")) / "trace.zip"
        try:
            await self._context.tracing.stop(path=str(trace_path))
            trace_bytes = trace_path.read_bytes()
            self._trace_active = False
            return {"success": True, "trace_bytes": trace_bytes}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_cookies(self) -> List[Dict[str, Any]]:
        """Get cookies for current context."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        return await self._context.cookies()

    async def set_cookies(self, cookies: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Set cookies in current context."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.add_cookies(cookies)
            return {"success": True, "count": len(cookies)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def clear_cookies(self) -> Dict[str, Any]:
        """Clear cookies in current context."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.clear_cookies()
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def get_storage(self, kind: str) -> Dict[str, str]:
        """Get localStorage/sessionStorage key-values for current page."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        storage_name = "localStorage" if kind == "local" else "sessionStorage"
        script = f"""
            () => {{
                const out = {{}};
                for (let i = 0; i < window.{storage_name}.length; i++) {{
                    const key = window.{storage_name}.key(i);
                    if (key !== null) {{
                        out[key] = window.{storage_name}.getItem(key) ?? "";
                    }}
                }}
                return out;
            }}
        """
        result = await self._page.evaluate(script)
        return result if isinstance(result, dict) else {}

    async def set_storage(self, kind: str, values: Dict[str, str]) -> Dict[str, Any]:
        """Set localStorage/sessionStorage values for current page."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        storage_name = "localStorage" if kind == "local" else "sessionStorage"
        script = f"""
            (vals) => {{
                for (const [k, v] of Object.entries(vals)) {{
                    window.{storage_name}.setItem(String(k), String(v));
                }}
                return true;
            }}
        """
        await self._page.evaluate(script, values)
        return {"success": True, "count": len(values)}

    async def clear_storage(self, kind: str) -> Dict[str, Any]:
        """Clear localStorage/sessionStorage for current page."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        storage_name = "localStorage" if kind == "local" else "sessionStorage"
        await self._page.evaluate(f"() => window.{storage_name}.clear()")
        return {"success": True}

    async def set_offline(self, offline: bool) -> Dict[str, Any]:
        """Set context offline mode."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.set_offline(offline)
            return {"success": True, "offline": offline}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def set_headers(self, headers: Dict[str, str]) -> Dict[str, Any]:
        """Set extra HTTP headers for context."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            await self._context.set_extra_http_headers(headers)
            return {"success": True, "header_count": len(headers)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def set_http_credentials(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        clear: bool = False,
    ) -> Dict[str, Any]:
        """Set or clear HTTP basic auth credentials."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            if clear:
                await self._context.set_http_credentials(None)
            else:
                if username is None or password is None:
                    return {
                        "success": False,
                        "error": "username/password required unless clear=true",
                    }
                await self._context.set_http_credentials(
                    {"username": username, "password": password}
                )
            return {"success": True, "cleared": clear}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def set_geolocation(
        self,
        *,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        accuracy: Optional[float] = None,
        clear: bool = False,
    ) -> Dict[str, Any]:
        """Set or clear context geolocation."""
        if not self._context:
            raise RuntimeError("Browser not connected")
        try:
            if clear:
                await self._context.set_geolocation(None)
                return {"success": True, "cleared": True}
            if latitude is None or longitude is None:
                return {
                    "success": False,
                    "error": "latitude/longitude required unless clear=true",
                }
            geo: Dict[str, Any] = {
                "latitude": float(latitude),
                "longitude": float(longitude),
            }
            if accuracy is not None:
                geo["accuracy"] = float(accuracy)
            await self._context.grant_permissions(["geolocation"])
            await self._context.set_geolocation(geo)
            return {"success": True, "geolocation": geo}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def set_media(
        self, media: Optional[str] = None, color_scheme: Optional[str] = None
    ) -> Dict[str, Any]:
        """Emulate media settings on current page."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            kwargs: Dict[str, Any] = {}
            if media:
                kwargs["media"] = media
            if color_scheme:
                kwargs["color_scheme"] = color_scheme
            await self._page.emulate_media(**kwargs)
            return {"success": True, "media": media, "color_scheme": color_scheme}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def set_timezone(self, timezone: str) -> Dict[str, Any]:
        """
        Set timezone for current context.

        Playwright requires timezone at context creation time; this is not mutable at runtime.
        """
        return {
            "success": False,
            "error": (
                "Dynamic timezone updates are not supported for an already-running context. "
                "Reconnect with a context configured for the desired timezone."
            ),
            "requested_timezone": timezone,
        }

    async def set_locale(self, locale: str) -> Dict[str, Any]:
        """
        Set locale for current context.

        Playwright requires locale at context creation time; this is not mutable at runtime.
        """
        return {
            "success": False,
            "error": (
                "Dynamic locale updates are not supported for an already-running context. "
                "Reconnect with a context configured for the desired locale."
            ),
            "requested_locale": locale,
        }

    async def set_device(self, device: str) -> Dict[str, Any]:
        """
        Apply a device preset best-effort.

        This currently supports viewport changes for common presets.
        """
        if not self._page:
            raise RuntimeError("Browser not connected")
        preset = device.strip().lower()
        presets: Dict[str, Dict[str, int]] = {
            "iphone 14": {"width": 390, "height": 844},
            "iphone 14 pro": {"width": 393, "height": 852},
            "iphone se": {"width": 375, "height": 667},
            "pixel 7": {"width": 412, "height": 915},
            "ipad": {"width": 810, "height": 1080},
        }
        target = presets.get(preset)
        if not target:
            return {"success": False, "error": f"Unknown device preset: {device}"}
        return await self.resize_viewport(target["width"], target["height"])

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

                line = self._build_browser_use_like_interactive_line(
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
        snapshot_text += "DOM tree (browser-use style):\n"
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

    def _build_browser_use_like_interactive_line(
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
        """Format a browser-use-like interactive line with lightweight tag attrs."""
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

        # Use Playwright's accessibility snapshot
        snapshot = await self._page.accessibility.snapshot()

        def format_node(node, depth=0):
            lines = []
            indent = "  " * depth
            role = node.get("role", "")
            name = node.get("name", "")

            if role and role not in ["generic", "none"]:
                line = f"{indent}- {role}"
                if name:
                    line += f': "{name}"'
                lines.append(line)

            for child in node.get("children", []):
                lines.extend(format_node(child, depth + 1))

            return lines

        lines = format_node(snapshot)
        snapshot_text = f"Title: {title}\nURL: {url}\n\nAccessibility Tree:\n"
        snapshot_text += "\n".join(lines)
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
        if not self._page:
            raise RuntimeError("Browser not connected")

        role_ref_key = parse_role_ref(ref)
        if role_ref_key:
            role_ref = self._get_role_ref(role_ref_key, self._page)
            if role_ref:
                try:
                    frame_selector = self._get_role_frame_selector(self._page)
                    root = (
                        self._page.frame_locator(frame_selector)
                        if frame_selector
                        else self._page
                    )
                    role_locator_kwargs: Dict[str, Any] = {}
                    if role_ref.name:
                        role_locator_kwargs["name"] = role_ref.name
                    locator = root.get_by_role(role_ref.role, **role_locator_kwargs)
                    if role_ref.nth is not None:
                        locator = locator.nth(role_ref.nth)
                    return locator
                except Exception as e:
                    logger.debug(f"Role ref resolution failed for {ref}: {e}")

        return self._page.locator(f"[data-windie-ref='{ref}'], [aria-ref='{ref}']")

    async def _resolve_click_locator(self, ref: str) -> tuple[Any, Dict[str, Any]]:
        """
        Resolve locator for click operations.

        For role refs without explicit nth, resolve to one deterministic visible
        candidate or fail with an ambiguity error. This avoids oscillating auto-scroll
        retries across duplicate controls (e.g., sticky headers/footers/carousels).
        """
        locator = self._resolve_ref_locator(ref)
        resolution_meta: Dict[str, Any] = {}
        role_ref_key = parse_role_ref(ref)
        if not role_ref_key or not self._page:
            return locator, resolution_meta

        role_ref = self._get_role_ref(role_ref_key, self._page)
        if role_ref and role_ref.nth is not None:
            return locator, resolution_meta

        try:
            count = await locator.count()
        except Exception:
            return locator, resolution_meta

        if count <= 1:
            return locator, resolution_meta
        resolution_meta["candidate_count"] = count

        viewport_width = 0.0
        viewport_height = 0.0
        try:
            viewport = getattr(self._page, "viewport_size", None)
            if isinstance(viewport, dict):
                viewport_width = float(viewport.get("width") or 0.0)
                viewport_height = float(viewport.get("height") or 0.0)
        except Exception:
            viewport_width = 0.0
            viewport_height = 0.0

        has_viewport = viewport_width > 0 and viewport_height > 0
        visible_candidates: list[tuple[int, Any]] = []
        in_viewport_candidates: list[tuple[int, Any]] = []
        max_probe = min(count, 25)
        for idx in range(max_probe):
            candidate = locator.nth(idx)
            try:
                if not await candidate.is_visible():
                    continue
            except Exception:
                continue

            visible_candidates.append((idx, candidate))
            if not has_viewport:
                continue

            try:
                box = await candidate.bounding_box()
                if not isinstance(box, dict):
                    continue
                x = float(box.get("x") or 0.0)
                y = float(box.get("y") or 0.0)
                w = float(box.get("width") or 0.0)
                h = float(box.get("height") or 0.0)
                intersects_viewport = (
                    w > 0
                    and h > 0
                    and x < viewport_width
                    and y < viewport_height
                    and (x + w) > 0
                    and (y + h) > 0
                )
                if intersects_viewport:
                    in_viewport_candidates.append((idx, candidate))
            except Exception:
                continue

        if has_viewport and len(in_viewport_candidates) == 1:
            idx, candidate = in_viewport_candidates[0]
            resolution_meta["candidate_index"] = idx
            return candidate, resolution_meta

        if len(visible_candidates) == 1:
            idx, candidate = visible_candidates[0]
            resolution_meta["candidate_index"] = idx
            return candidate, resolution_meta

        if not visible_candidates:
            return locator, resolution_meta

        visible_count = (
            len(in_viewport_candidates) if has_viewport else len(visible_candidates)
        )
        scope = "in viewport" if has_viewport else "visible"
        raise RuntimeError(
            f"Ambiguous role ref '{ref}': matched {count} elements; "
            f"{visible_count} are {scope}. Take a fresh snapshot and use a more specific ref."
        )

    @staticmethod
    def _is_recoverable_click_error(error_text: str) -> bool:
        lowered = str(error_text or "").lower()
        if not lowered:
            return False
        recoverable_markers = (
            "intercepts pointer events",
            "another element would receive",
            "outside of the viewport",
            "not visible",
            "not stable",
            "element is detached",
            "timeout",
        )
        return any(marker in lowered for marker in recoverable_markers)

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
        try:
            select_target = await locator.evaluate(
                """
                (el) => {
                  const tag = (el.tagName || "").toLowerCase();
                  if (tag === "option") {
                    const select = el.closest("select");
                    if (!select) return null;
                    const selected = select.selectedOptions && select.selectedOptions[0];
                    const selectedLabel = selected
                      ? (selected.textContent || "").trim()
                      : "";
                    return {
                      source_tag: "option",
                      use_ancestor_select: true,
                      value: String(el.value || ""),
                      label: (el.textContent || "").trim(),
                      current_value: String(select.value || ""),
                      current_label: selectedLabel,
                    };
                  }
                  if (tag === "select") {
                    const selected = el.selectedOptions && el.selectedOptions[0];
                    const selectedLabel = selected
                      ? (selected.textContent || "").trim()
                      : "";
                    return {
                      source_tag: "select",
                      use_ancestor_select: false,
                      value: String(el.value || ""),
                      label: selectedLabel,
                      current_value: String(el.value || ""),
                      current_label: selectedLabel,
                    };
                  }
                  return null;
                }
                """
            )
        except Exception:
            return None

        if not isinstance(select_target, dict):
            return None

        source_tag = str(select_target.get("source_tag") or "")
        target_locator = locator
        if bool(select_target.get("use_ancestor_select")):
            target_locator = locator.locator("xpath=ancestor::select[1]")

        current_value = select_target.get("current_value")
        value = select_target.get("value")
        label = select_target.get("label")
        current_label = select_target.get("current_label")

        try:
            selected: List[str]
            if isinstance(value, str) and value:
                selected = await target_locator.select_option(value=value)
            elif isinstance(current_value, str) and current_value:
                selected = await target_locator.select_option(value=current_value)
            elif isinstance(label, str) and label:
                selected = await target_locator.select_option(label=label)
            elif isinstance(current_label, str) and current_label:
                selected = await target_locator.select_option(label=current_label)
            else:
                return None
        except Exception:
            return None

        return {
            "success": True,
            "action": "click",
            "ref": ref,
            "forced": True,
            "strategy": "select_option",
            "source_tag": source_tag,
            "selected": selected,
            **resolution_meta,
        }

    async def click(
        self,
        ref: str,
        double_click: bool = False,
        button: str = "left",
    ) -> Dict[str, Any]:
        """Click an element by reference."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            locator, resolution_meta = await self._resolve_click_locator(ref)
        except Exception as resolve_error:
            return {"success": False, "error": str(resolve_error)}

        default_click_timeout_ms = 2500
        force_click_timeout_ms = 1500

        try:
            if double_click:
                await locator.dblclick(button=button, timeout=default_click_timeout_ms)
                strategy = "dblclick"
            else:
                await locator.click(button=button, timeout=default_click_timeout_ms)
                strategy = "playwright"
            return {
                "success": True,
                "action": "click",
                "ref": ref,
                "strategy": strategy,
                **resolution_meta,
            }
        except Exception as e:
            error_text = str(e)
            logger.warning(f"Click failed, retrying with fallback: {error_text}")
            recoverable = self._is_recoverable_click_error(error_text)

            # Fallback 1: force click to bypass actionability checks.
            if not double_click and recoverable:
                if button == "left":
                    select_fallback_result = (
                        await self._try_select_option_click_fallback(
                            locator,
                            ref=ref,
                            resolution_meta=resolution_meta,
                        )
                    )
                    if select_fallback_result is not None:
                        return select_fallback_result

                try:
                    await locator.click(
                        button=button,
                        force=True,
                        timeout=force_click_timeout_ms,
                    )
                    return {
                        "success": True,
                        "action": "click",
                        "ref": ref,
                        "forced": True,
                        "strategy": "force",
                        **resolution_meta,
                    }
                except Exception as force_error:
                    error_text = str(force_error)

                # Fallback 2: DOM click to bypass pointer interception.
                # Limit to left clicks because DOM click cannot represent right/middle.
                if button == "left":
                    try:
                        await locator.evaluate("el => el.click()")
                        return {
                            "success": True,
                            "action": "click",
                            "ref": ref,
                            "forced": True,
                            "method": "dom",
                            "strategy": "dom",
                            **resolution_meta,
                        }
                    except Exception as dom_error:
                        error_text = str(dom_error)

            logger.error(f"Click failed after fallbacks: {error_text}")
            return {"success": False, "error": error_text}

    async def type_text(
        self,
        ref: str,
        text: str,
        submit: bool = False,
        clear_first: bool = True,
    ) -> Dict[str, Any]:
        """Type text into an element."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            locator = self._resolve_ref_locator(ref)

            if clear_first:
                await locator.fill(text)
            else:
                await locator.type(text)

            if submit:
                await locator.press("Enter")

            return {"success": True, "action": "type", "ref": ref, "text": text}
        except Exception as e:
            logger.error(f"Type failed: {e}")
            return {"success": False, "error": str(e)}

    async def press_key(self, key: str) -> Dict[str, Any]:
        """Press a keyboard key."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            await self._page.keyboard.press(key)
            return {"success": True, "action": "press", "key": key}
        except Exception as e:
            logger.error(f"Key press failed: {e}")
            return {"success": False, "error": str(e)}

    async def scroll(
        self,
        direction: str = "down",
        amount: int = 500,
    ) -> Dict[str, Any]:
        """Scroll the page."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            if direction == "down":
                await self._page.mouse.wheel(0, amount)
            elif direction == "up":
                await self._page.mouse.wheel(0, -amount)
            elif direction == "left":
                await self._page.mouse.wheel(-amount, 0)
            elif direction == "right":
                await self._page.mouse.wheel(amount, 0)

            return {"success": True, "action": "scroll", "direction": direction}
        except Exception as e:
            logger.error(f"Scroll failed: {e}")
            return {"success": False, "error": str(e)}

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
        if not self._page:
            raise RuntimeError("Browser not connected")

        if full_page and (ref or element):
            raise ValueError("full_page cannot be combined with ref/element screenshot")
        if ref and element:
            raise ValueError("Specify only one of ref or element")

        screenshot_args: Dict[str, Any] = {
            "type": "jpeg" if image_type == "jpeg" else "png"
        }
        if screenshot_args["type"] == "jpeg" and quality is not None:
            screenshot_args["quality"] = max(1, min(100, int(quality)))

        if ref:
            locator = self._resolve_ref_locator(ref)
            return await locator.screenshot(**screenshot_args)
        if element:
            locator = self._page.locator(element)
            return await locator.screenshot(**screenshot_args)
        return await self._page.screenshot(
            full_page=full_page,
            **screenshot_args,
        )

    async def pdf(self) -> bytes:
        """Create a PDF of the current page."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        return await self._page.pdf(print_background=True)

    async def hover(self, ref: str) -> Dict[str, Any]:
        """Hover on an element by reference."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            await locator.hover()
            return {"success": True, "action": "hover", "ref": ref}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def drag(self, start_ref: str, end_ref: str) -> Dict[str, Any]:
        """Drag from one referenced element to another."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            start = self._resolve_ref_locator(start_ref)
            end = self._resolve_ref_locator(end_ref)
            await start.drag_to(end)
            return {
                "success": True,
                "action": "drag",
                "start_ref": start_ref,
                "end_ref": end_ref,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def select_options(self, ref: str, values: List[str]) -> Dict[str, Any]:
        """Select options in a <select> element by reference."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            selected = await locator.select_option(values)
            return {
                "success": True,
                "action": "select",
                "ref": ref,
                "selected": selected,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def set_input_files(self, ref: str, paths: List[str]) -> Dict[str, Any]:
        """Set file input files by reference."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            locator = self._resolve_ref_locator(ref)
            await locator.set_input_files(paths)
            return {"success": True, "action": "upload", "ref": ref, "paths": paths}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def fill_fields(self, fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Fill multiple fields by ref."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        filled = 0
        errors: List[Dict[str, str]] = []
        for item in fields:
            ref = item.get("ref")
            text = item.get("text")
            if not isinstance(ref, str) or not isinstance(text, str):
                errors.append(
                    {
                        "ref": str(ref),
                        "error": "Each field must include string ref/text",
                    }
                )
                continue

            result = await self.type_text(
                ref=ref, text=text, submit=False, clear_first=True
            )
            if result.get("success"):
                filled += 1
            else:
                errors.append(
                    {"ref": ref, "error": str(result.get("error", "fill failed"))}
                )

        return {
            "success": len(errors) == 0,
            "action": "fill",
            "filled": filled,
            "errors": errors,
        }

    async def resize_viewport(self, width: int, height: int) -> Dict[str, Any]:
        """Resize viewport dimensions."""
        if not self._page:
            raise RuntimeError("Browser not connected")
        try:
            w = max(1, int(width))
            h = max(1, int(height))
            await self._page.set_viewport_size({"width": w, "height": h})
            return {"success": True, "action": "resize", "width": w, "height": h}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def wait_for_load(
        self,
        state: str = "networkidle",
        timeout: int = 30000,
    ) -> Dict[str, Any]:
        """Wait for page to reach a load state."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            await self._page.wait_for_load_state(state, timeout=timeout)
            return {"success": True, "state": state}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def evaluate(self, script: str) -> Any:
        """Evaluate JavaScript in the page."""
        if not self._page:
            raise RuntimeError("Browser not connected")

        try:
            result = await self._page.evaluate(script)
            return {"success": True, "result": result}
        except Exception as e:
            return {"success": False, "error": str(e)}

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

            self._page = None
            self._context = None
            self._mode = None
            self._cdp_url = None
            self._ref_registry_by_tab.clear()
            self._role_refs_by_tab.clear()
            self._role_refs_frame_by_tab.clear()
            self._observed_tabs.clear()
            self._console_messages_by_tab.clear()
            self._dialog_events_by_tab.clear()
            self._dialog_arms_by_tab.clear()
            self._dialog_waiters_by_tab.clear()
            self._page_errors_by_tab.clear()
            self._network_requests_by_tab.clear()
            self._network_request_id_by_req = WeakKeyDictionary()
            self._next_request_id_by_tab.clear()
            self._trace_active = False

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
