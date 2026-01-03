"""Agent plugins package."""

from backend.src.agent.plugins.interface import AgentPlugin, PluginResult
from backend.src.agent.plugins.manager import PluginManager
__all__ = [
    "AgentPlugin",
    "PluginResult",
    "PluginManager",
]

