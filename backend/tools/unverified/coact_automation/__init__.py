"""
CoAct-1 Computer Automation Tool

Multi-agent computer automation using orchestrated AI agents.
"""

from .tool import CoAct1Tool, CoAct1Args
from .coordinator import WorkflowCoordinator

__all__ = [
    "CoAct1Tool",
    "CoAct1Args",
    "WorkflowCoordinator",
]
