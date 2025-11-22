from typing import Any, Dict, List, Optional, Protocol
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

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        """Called when a new user query is received."""
        ...

    async def on_llm_response(self, response_text: str) -> Optional[PluginResult]:
        """Called when the LLM generates a text response."""
        ...

    async def on_tool_start(self, tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]:
        """Called before a tool is executed."""
        ...

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """
        Called after a tool finishes execution.
        Crucial for side-effects like capturing screenshots or storing memory.
        """
        ...

