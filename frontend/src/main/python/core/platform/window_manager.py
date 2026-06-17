"""Platform window-manager selection."""

import platform

IS_WINDOWS = platform.system() == "Windows"
IS_MACOS = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"

if IS_WINDOWS:
    from .windows import WindowsWindowManager as WindowManager
elif IS_MACOS:
    from .macos import MacOSWindowManager as WindowManager
elif IS_LINUX:
    from .linux import LinuxWindowManager as WindowManager
else:
    from .base import BaseWindowManager as WindowManager
