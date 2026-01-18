"""
Plugin Interface for Agent Extensions.

This module defines the Protocol interface for agent plugins, allowing developers
to extend agent functionality through hooks and interceptors.
"""
from typing import Any, Dict, Optional, Protocol
from dataclasses import dataclass

@dataclass
class PluginResult:
    """
    Result from a plugin hook.
    If 'content' is set, it may interrupt the standard flow or append to it.
    """
    content: Optional[str] = None
    stop_execution: bool = False
    artifacts: Optional[Dict[str, Any]] = None

class AgentPlugin(Protocol):
    """
    Interface for Agent Plugins.
    Plugins can intercept and modify the agent's execution flow.
    """
    
    name: str

    async def initialize(self, container: Any = None) -> None:
        """
        Called when the plugin is initialized.
        
        Args:
            container: The dependency injection container (optional)
        """
        ...

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """
        Called after a tool finishes execution.
        Crucial for side-effects like capturing screenshots or storing memory.
        """
        ...
