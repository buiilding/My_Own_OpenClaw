"""
Tool Discovery System.

This module provides a unified interface for discovering tools from various sources,
including core tools (via entry points) and marketplace tools (via filesystem).
"""

from backend.src.tools.discovery.tool_discoverer import ToolDiscoverer

__all__ = ["ToolDiscoverer"]
