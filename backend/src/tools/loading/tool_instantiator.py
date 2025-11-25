"""
Tool Instantiator Service.

This module provides a service for instantiating tool classes with proper
dependency injection, separating instantiation logic from discovery/loading.
"""
import logging
import inspect
from typing import Any, Optional, Type, TYPE_CHECKING

from backend.src.sdk.tool import Tool as SDKTool

if TYPE_CHECKING:
    from backend.src.tools.discovery.base import DiscoveredTool

logger = logging.getLogger(__name__)


class ToolInstantiator:
    """
    Service for instantiating tool classes.
    
    Handles dependency injection and tool instantiation,
    ensuring consistent tool creation across the system.
    """
    
    def __init__(self, tool_search_engine: Optional[Any] = None):
        """
        Initialize the tool instantiator.
        
        Args:
            tool_search_engine: Optional tool search engine for tools that need it
        """
        self.tool_search_engine = tool_search_engine
    
    def instantiate_tool(
        self, 
        tool_class: Type[SDKTool],
        tool_name: Optional[str] = None
    ) -> Optional[SDKTool]:
        """
        Instantiate a tool class with proper dependency injection.
        
        Args:
            tool_class: Tool class to instantiate
            tool_name: Optional tool name for logging
            
        Returns:
            Tool instance or None if instantiation fails
        """
        if not issubclass(tool_class, SDKTool):
            logger.error(f"Class {tool_class.__name__} does not inherit from SDKTool.")
            return None
        
        try:
            # Check if tool needs dependencies in __init__
            sig = inspect.signature(tool_class.__init__)
            params = list(sig.parameters.values())[1:]  # skip self
            
            args = []
            if len(params) > 0:
                # Handle special cases (e.g., tool_search_engine)
                param_names = [p.name for p in params]
                if "tool_search_engine" in param_names:
                    args.append(self.tool_search_engine)
                # Add more dependency injection cases here as needed
            
            instance = tool_class(*args)
            logger.debug(f"Instantiated tool: {tool_name or tool_class.__name__}")
            return instance
            
        except Exception as e:
            logger.error(
                f"Failed to instantiate tool {tool_name or tool_class.__name__}: {e}",
                exc_info=True
            )
            return None
    
    async def instantiate_discovered_tool(
        self, 
        discovered_tool: "DiscoveredTool"
    ) -> Optional[SDKTool]:
        """
        Instantiate a discovered tool.
        
        Args:
            discovered_tool: DiscoveredTool object with tool class
            
        Returns:
            Tool instance or None if instantiation fails
        """
        if discovered_tool.tool_class is None:
            logger.warning(f"Discovered tool {discovered_tool.name} has no tool_class")
            return None
        
        return self.instantiate_tool(
            discovered_tool.tool_class,
            tool_name=discovered_tool.name
        )

