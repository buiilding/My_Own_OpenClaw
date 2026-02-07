"""
Remote browser control tool for backend.

This module re-exports RemoteBrowserTool from backend.src.tools.remote
to maintain backward compatibility.
"""

from backend.src.tools.remote import RemoteBrowserTool

__all__ = ["RemoteBrowserTool"]
