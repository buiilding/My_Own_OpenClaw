"""
[DEPRECATED] Persistent Shell Manager.

This module is deprecated. Use backend.src.services.shell instead.
"""
import logging

logger = logging.getLogger(__name__)

class BaseShellManager:
    """Deprecated base class."""
    def __init__(self):
        logger.warning("BaseShellManager is deprecated. Use backend.src.services.shell instead.")

class UnixShellManager(BaseShellManager):
    """Deprecated Unix manager."""
    pass

class WindowsShellManager(BaseShellManager):
    """Deprecated Windows manager."""
    pass

def get_shell_manager():
    """Deprecated accessor."""
    from backend.src.services.shell import get_shell_manager as new_get_shell_manager
    logger.warning("persistent_shell_manager.get_shell_manager is deprecated. Redirecting to new implementation.")
    return new_get_shell_manager()
