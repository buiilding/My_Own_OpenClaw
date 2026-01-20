"""
Tool Lifecycle Management.

This module provides lifecycle management for tools, including initialization,
cleanup, and resource management.
"""
import logging
import asyncio
from typing import Dict, List, Optional, Set, TYPE_CHECKING
from contextlib import asynccontextmanager

from backend.src.sdk.tool import Tool as SDKTool

if TYPE_CHECKING:
    from backend.src.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class ToolLifecycleManager:
    """
    Manages the lifecycle of tools, including initialization and cleanup.
    
    Provides explicit lifecycle management for tools that require
    resource initialization or cleanup.
    """
    
    def __init__(self, tool_registry: Optional["ToolRegistry"] = None):
        """
        Initialize the lifecycle manager.
        
        Args:
            tool_registry: Optional tool registry for accessing tools
        """
        self.tool_registry = tool_registry
        self._initialized_tools: Set[str] = set()
        self._tool_resources: Dict[str, Dict[str, any]] = {}
    
    async def initialize_tool(self, tool: SDKTool) -> bool:
        """
        Initialize a tool if it has an async initialization method.
        
        Args:
            tool: Tool instance to initialize
            
        Returns:
            True if initialization succeeded or was not needed, False otherwise
        """
        tool_name = tool.name
        
        # Skip if already initialized
        if tool_name in self._initialized_tools:
            logger.debug(f"Tool {tool_name} already initialized")
            return True
        
        # Check if tool has async_init method
        if hasattr(tool, "async_init"):
            try:
                logger.debug(f"Initializing tool: {tool_name}")
                result = await tool.async_init()
                
                # Store initialization result/resources
                self._tool_resources[tool_name] = {
                    "initialized": True,
                    "init_result": result,
                }
                
                self._initialized_tools.add(tool_name)
                logger.info(f"Successfully initialized tool: {tool_name}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to initialize tool {tool_name}: {e}", exc_info=True)
                return False
        
        # Tool doesn't need initialization
        self._initialized_tools.add(tool_name)
        return True
    
    async def cleanup_tool(self, tool: SDKTool) -> bool:
        """
        Cleanup a tool if it has an async cleanup method.
        
        Args:
            tool: Tool instance to cleanup
            
        Returns:
            True if cleanup succeeded or was not needed, False otherwise
        """
        tool_name = tool.name
        
        # Skip if not initialized
        if tool_name not in self._initialized_tools:
            logger.debug(f"Tool {tool_name} not initialized, skipping cleanup")
            return True
        
        # Check if tool has async_cleanup method
        if hasattr(tool, "async_cleanup"):
            try:
                logger.debug(f"Cleaning up tool: {tool_name}")
                await tool.async_cleanup()
                
                # Remove from initialized set
                self._initialized_tools.discard(tool_name)
                self._tool_resources.pop(tool_name, None)
                
                logger.info(f"Successfully cleaned up tool: {tool_name}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to cleanup tool {tool_name}: {e}", exc_info=True)
                return False
        
        # Tool doesn't need cleanup
        self._initialized_tools.discard(tool_name)
        return True
    
    async def initialize_all_tools(self, tools: List[SDKTool]) -> Dict[str, bool]:
        """
        Initialize multiple tools in parallel.
        
        Args:
            tools: List of tools to initialize
            
        Returns:
            Dictionary mapping tool names to initialization success status
        """
        results: Dict[str, bool] = {}
        
        # Initialize tools in parallel
        tasks = [
            self.initialize_tool(tool) 
            for tool in tools
        ]
        
        init_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for tool, result in zip(tools, init_results):
            if isinstance(result, Exception):
                logger.error(f"Exception initializing {tool.name}: {result}")
                results[tool.name] = False
            else:
                results[tool.name] = result
        
        return results
    
    async def cleanup_all_tools(self, tools: Optional[List[SDKTool]] = None) -> Dict[str, bool]:
        """
        Cleanup multiple tools.
        
        Args:
            tools: Optional list of tools to cleanup. If None, cleanup all initialized tools.
            
        Returns:
            Dictionary mapping tool names to cleanup success status
        """
        if tools is None and self.tool_registry:
            # Cleanup all tools from registry
            tools = self.tool_registry.get_all_tools()
        elif tools is None:
            logger.warning("No tools provided and no registry available for cleanup")
            return {}
        
        results: Dict[str, bool] = {}
        
        # Cleanup tools sequentially (cleanup order may matter)
        for tool in tools:
            result = await self.cleanup_tool(tool)
            results[tool.name] = result
        
        return results
    
    def is_initialized(self, tool_name: str) -> bool:
        """
        Check if a tool is initialized.
        
        Args:
            tool_name: Name of the tool
            
        Returns:
            True if tool is initialized, False otherwise
        """
        return tool_name in self._initialized_tools
    
    @asynccontextmanager
    async def managed_tool(self, tool: SDKTool):
        """
        Context manager for tool lifecycle.
        
        Usage:
            async with lifecycle_manager.managed_tool(tool):
                # Use tool here
                pass
            # Tool is automatically cleaned up
        
        Args:
            tool: Tool instance to manage
        """
        await self.initialize_tool(tool)
        try:
            yield tool
        finally:
            await self.cleanup_tool(tool)
    
    def get_initialized_tools(self) -> Set[str]:
        """
        Get set of initialized tool names.
        
        Returns:
            Set of initialized tool names
        """
        return self._initialized_tools.copy()

