"""
Tools Domain Package.

This package contains all tool-related functionality including tool registry,
definitions, and orchestrator.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.tools.orchestrator import ToolResultOrchestrator
    from backend.src.tools.registry import ToolRegistry

__all__ = ["ToolRegistry", "ToolResultOrchestrator"]


def __getattr__(name: str):
    if name == "ToolRegistry":
        from backend.src.tools.registry import ToolRegistry

        return ToolRegistry
    if name == "ToolResultOrchestrator":
        from backend.src.tools.orchestrator import ToolResultOrchestrator

        return ToolResultOrchestrator
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
