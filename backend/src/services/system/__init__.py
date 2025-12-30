"""
System Interface Abstraction Layer.

Provides platform-agnostic system operations.
"""

from backend.src.services.system.factory import get_system_interface, SystemInterface

__all__ = [
    "get_system_interface",
    "SystemInterface",
]

