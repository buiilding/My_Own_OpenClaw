"""Live browser session runtime state for BrowserController."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright


@dataclass
class BrowserSessionRuntime:
    """Own live Playwright/session handles and related runtime flags."""

    playwright: Optional["Playwright"] = None
    browser: Optional["Browser"] = None
    context: Optional["BrowserContext"] = None
    page: Optional["Page"] = None
    cdp_url: Optional[str] = None
    mode: Optional[str] = None
    user_data_dir: Optional[Path] = None
    browser_process: object | None = None
    headless: bool = False
    trace_active: bool = False

    @property
    def is_connected(self) -> bool:
        return self.context is not None and self.page is not None

    @property
    def current_url(self) -> str:
        if self.page is None:
            return ""
        return self.page.url

    @property
    def current_title(self) -> str:
        if self.page is None:
            return ""
        title_attr = getattr(self.page, "title", None)
        return title_attr if isinstance(title_attr, str) else ""

    def reset(self) -> None:
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.cdp_url = None
        self.mode = None
        self.user_data_dir = None
        self.browser_process = None
        self.headless = False
        self.trace_active = False
