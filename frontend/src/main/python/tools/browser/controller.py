"""
Browser controller for web automation via Playwright.

Supports two modes:
1. User's Chrome: Connect to existing Chrome via CDP
2. Managed Chromium: Launch isolated browser instance
"""

import asyncio
import logging
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

# Playwright imports
from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

from tools.browser.chrome_detection import ChromeExecutable, find_chrome_executable

logger = logging.getLogger(__name__)


@dataclass
class PageSnapshot:
    """AI-friendly page snapshot with element references."""
    text: str
    refs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    url: str = ""
    title: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "snapshot": self.text,
            "refs": self.refs,
            "url": self.url,
            "title": self.title,
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
        
    @property
    def is_connected(self) -> bool:
        """Check if browser is connected."""
        return self._browser is not None and self._page is not None
    
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
            return self.title
        return ""
    
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
            
            self._cdp_url = cdp_url
            self._mode = "user_chrome"
            
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
            
            # Launch browser with custom args
            launch_args = {
                "headless": headless,
                "executable_path": executable_path,
                "args": [
                    f"--user-data-dir={self._user_data_dir}",
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
            
            self._browser = await self._playwright.chromium.launch(**launch_args)
            self._context = await self._browser.new_context(
                viewport={"width": 1920, "height": 1080}
            )
            self._page = await self._context.new_page()
            self._mode = "managed"
            
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
            tabs.append(BrowserTab(
                target_id=str(id(page)),  # Simple ID for now
                title=await page.title(),
                url=page.url,
            ))
        return tabs
    
    async def switch_tab(self, target_id: str) -> bool:
        """Switch to a different tab by ID."""
        if not self._context:
            return False
        
        for page in self._context.pages:
            if str(id(page)) == target_id:
                self._page = page
                await page.bring_to_front()
                return True
        return False
    
    async def navigate(self, url: str, wait_until: str = "networkidle") -> Dict[str, Any]:
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
    
    async def get_page_snapshot(
        self,
        format_type: str = "ai",
        max_chars: int = 5000,
    ) -> PageSnapshot:
        """
        Get AI-friendly page snapshot with element references.
        
        Args:
            format_type: "ai" (numbered refs) or "aria" (accessibility tree)
            max_chars: Maximum characters in snapshot
        
        Returns:
            PageSnapshot object
        """
        if not self._page:
            raise RuntimeError("Browser not connected")
        
        if format_type == "aria":
            return await self._get_aria_snapshot()
        else:
            return await self._get_ai_snapshot(max_chars)
    
    async def _get_ai_snapshot(self, max_chars: int = 5000) -> PageSnapshot:
        """Build AI snapshot with numbered element references."""
        title = await self._page.title()
        url = self._page.url
        
        # Query interactive elements
        elements = await self._page.query_selector_all(
            'button, input, textarea, select, a, [role="button"], '
            '[role="link"], [role="textbox"], [role="checkbox"], '
            '[role="radio"], [role="combobox"], [role="searchbox"]'
        )
        
        lines = []
        refs: Dict[str, Dict[str, Any]] = {}
        ref_num = 1
        
        for elem in elements:
            try:
                # Get element info
                tag = await elem.evaluate("el => el.tagName.toLowerCase()")
                role = await elem.get_attribute("role") or ""
                elem_type = await elem.get_attribute("type") or ""
                name = await self._get_element_name(elem)
                placeholder = await elem.get_attribute("placeholder") or ""
                
                # Skip hidden elements
                visible = await elem.is_visible()
                if not visible:
                    continue
                
                # Build description
                description = self._describe_element(
                    tag, role, elem_type, name, placeholder
                )
                
                if description:
                    lines.append(f"[{ref_num}] {description}")
                    
                    # Store ref info for later interaction
                    refs[str(ref_num)] = {
                        "role": role or tag,
                        "name": name,
                        "tag": tag,
                        "type": elem_type,
                        "selector": f"aria-ref={ref_num}",
                    }
                    
                    # Add data attribute for Playwright selection
                    await elem.evaluate(f"el => el.setAttribute('aria-ref', '{ref_num}')")
                    
                    ref_num += 1
            except Exception as e:
                logger.debug(f"Error processing element: {e}")
                continue
        
        # Build snapshot text
        snapshot_text = f"Title: {title}\nURL: {url}\n\n"
        snapshot_text += "\n".join(lines)
        
        # Truncate if too long
        if len(snapshot_text) > max_chars:
            snapshot_text = snapshot_text[:max_chars] + "\n... (truncated)"
        
        return PageSnapshot(
            text=snapshot_text,
            refs=refs,
            url=url,
            title=title,
        )
    
    async def _get_aria_snapshot(self) -> PageSnapshot:
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
        
        return PageSnapshot(
            text=snapshot_text,
            refs={},
            url=url,
            title=title,
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
            locator = self._page.locator(f"[aria-ref='{ref}']")
            
            if double_click:
                await locator.dblclick(button=button)
            else:
                await locator.click(button=button)
            
            return {"success": True, "action": "click", "ref": ref}
        except Exception as e:
            logger.error(f"Click failed: {e}")
            return {"success": False, "error": str(e)}
    
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
            locator = self._page.locator(f"[aria-ref='{ref}']")
            
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
    ) -> bytes:
        """
        Take a screenshot.
        
        Args:
            full_page: Capture full page height
            ref: Optional element reference to screenshot
        
        Returns:
            PNG image bytes
        """
        if not self._page:
            raise RuntimeError("Browser not connected")
        
        if ref:
            locator = self._page.locator(f"[aria-ref='{ref}']")
            return await locator.screenshot(type="png")
        else:
            return await self._page.screenshot(
                full_page=full_page,
                type="png",
            )
    
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
