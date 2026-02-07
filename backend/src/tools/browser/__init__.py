"""
Browser tools module for WindieOS backend.
"""

from typing import TYPE_CHECKING

from backend.src.tools.browser.schemas import BrowserControlArgs

if TYPE_CHECKING:
    from backend.src.tools.remote import RemoteBrowserTool

__all__ = ["RemoteBrowserTool", "BrowserControlArgs"]


def __getattr__(name: str):
    if name == "RemoteBrowserTool":
        from backend.src.tools.remote import RemoteBrowserTool

        return RemoteBrowserTool
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__():
    return sorted(__all__)
