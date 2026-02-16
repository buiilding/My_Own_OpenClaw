"""Browser Use adapter boundary for sidecar browser_control migration."""

from tools.browser_use_adapter.controller_adapter import (
    BrowserUseCompatibilityAdapter,
    get_browser_use_adapter,
)
from tools.browser_use_adapter.runtime_provider import (
    BrowserRuntimeProvider,
    ControllerBackedRuntimeProvider,
    get_browser_runtime_provider,
)
from tools.browser_use_adapter.types import AdapterActionResult, MigrationDecision

__all__ = [
    "AdapterActionResult",
    "BrowserRuntimeProvider",
    "BrowserUseCompatibilityAdapter",
    "ControllerBackedRuntimeProvider",
    "MigrationDecision",
    "get_browser_runtime_provider",
    "get_browser_use_adapter",
]
