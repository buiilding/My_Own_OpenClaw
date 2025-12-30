"""
Shell Management Abstraction Layer.

Provides platform-agnostic shell session management with proper PTY handling.
"""

from backend.src.services.shell.manager import get_shell_manager, ShellManager
from backend.src.services.shell.interface import ShellSession, ShellResult

__all__ = [
    "get_shell_manager",
    "ShellManager",
    "ShellSession",
    "ShellResult",
]

