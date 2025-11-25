"""Agent plugins package."""

from backend.src.agent.plugins.interface import AgentPlugin, PluginResult
from backend.src.agent.plugins.manager import PluginManager
from backend.src.agent.plugins.computer import ComputerUsePlugin

__all__ = [
    "AgentPlugin",
    "PluginResult",
    "PluginManager",
    "ComputerUsePlugin",
]

