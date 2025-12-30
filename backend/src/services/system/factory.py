"""
System Interface Factory.

Provides platform-appropriate SystemInterface implementation.
"""
import logging
import platform

from backend.src.services.system.interface import SystemInterface
from backend.src.services.system.linux_interface import LinuxSystemInterface
from backend.src.services.system.windows_interface import WindowsSystemInterface

logger = logging.getLogger(__name__)

# Global singleton instance
_system_interface: SystemInterface = None


def get_system_interface() -> SystemInterface:
    """
    Get the platform-appropriate system interface.
    
    Returns:
        SystemInterface instance for the current platform
    """
    global _system_interface
    if _system_interface is None:
        platform_name = platform.system()
        if platform_name == "Windows":
            _system_interface = WindowsSystemInterface()
        elif platform_name == "Linux":
            _system_interface = LinuxSystemInterface()
        else:
            # Default to Linux interface for macOS and others
            logger.warning(f"Unsupported platform: {platform_name}, using Linux interface")
            _system_interface = LinuxSystemInterface()
    return _system_interface

