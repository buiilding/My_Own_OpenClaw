"""
Tools Domain Package.

This package contains all tool-related functionality including tool registry,
definitions, and orchestrator.
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.tools.orchestrator import ToolOrchestrator
    from backend.src.tools.registry import ToolRegistry

__all__ = ["ToolRegistry", "ToolOrchestrator"]


def __getattr__(name: str):
    if name == "ToolRegistry":
        from backend.src.tools.registry import ToolRegistry

        return ToolRegistry
    if name == "ToolOrchestrator":
        from backend.src.tools.orchestrator import ToolOrchestrator

        return ToolOrchestrator
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
