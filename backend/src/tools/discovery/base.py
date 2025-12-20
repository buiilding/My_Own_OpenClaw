"""
Base Classes for Tool Discovery.

This module defines the abstract interfaces for tool discovery mechanisms.
"""
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from pathlib import Path

from backend.src.sdk.tool import Tool as SDKTool
from backend.src.tools.registry import ToolMetadata

logger = logging.getLogger(__name__)


@dataclass
class DiscoveredTool:
    """Represents a discovered tool with metadata."""
    name: str
    tool_class: type[SDKTool]
    source: str  # "core", "marketplace", "plugin", etc.
    metadata: Optional[Dict[str, Any]] = None
    priority: int = 100  # Lower = higher priority


class ToolDiscoverer(ABC):
    """
    Abstract base class for tool discovery mechanisms.
    
    Implementations discover tools from different sources (entry points,
    filesystem, plugins, etc.) and return DiscoveredTool objects.
    """
    
    @abstractmethod
    async def discover(self) -> List[DiscoveredTool]:
        """
        Discover tools from this source.
        
        Returns:
            List of discovered tools
        """
        pass
    
    @abstractmethod
    def get_source_name(self) -> str:
        """
        Get the name of this discovery source.
        
        Returns:
            Source name string (e.g., "core", "marketplace")
        """
        pass
    
    async def instantiate_tool(self, discovered_tool: DiscoveredTool) -> Optional[SDKTool]:
        """
        Instantiate a discovered tool.
        
        Args:
            discovered_tool: Discovered tool metadata
            
        Returns:
            Tool instance or None if instantiation fails
        """
        try:
            tool_class = discovered_tool.tool_class
            
            # Check if tool needs dependencies in __init__
            import inspect
            sig = inspect.signature(tool_class.__init__)
            params = list(sig.parameters.values())[1:]  # skip self
            
            args = []
            if len(params) > 0:
                # Handle special cases (e.g., tool_search_engine)
                param_names = [p.name for p in params]
                if "tool_search_engine" in param_names:
                    # Will be injected later if needed
                    args.append(None)
            
            instance = tool_class(*args)
            return instance
            
        except Exception as e:
            logger.error(
                f"Failed to instantiate tool {discovered_tool.name} from {discovered_tool.source}: {e}",
                exc_info=True
            )
            return None


class ToolDiscoveryService:
    """
    Unified service for discovering tools from multiple sources.
    
    Coordinates multiple ToolDiscoverer instances and provides a single
    interface for tool discovery across the entire system.
    """
    
    def __init__(self):
        """Initialize the discovery service."""
        self._discoverers: List[ToolDiscoverer] = []
        self._discovered_tools: Dict[str, DiscoveredTool] = {}
    
    def register_discoverer(self, discoverer: ToolDiscoverer) -> None:
        """
        Register a tool discovery mechanism.
        
        Args:
            discoverer: ToolDiscoverer instance
        """
        if discoverer not in self._discoverers:
            self._discoverers.append(discoverer)
            logger.info(f"Registered tool discoverer: {discoverer.get_source_name()}")
    
    def has_discoverer(self, source_name: str) -> bool:
        """
        Check if a discoverer with the given source name is registered.
        
        Args:
            source_name: Name of the source to check
            
        Returns:
            True if discoverer is registered, False otherwise
        """
        return any(
            discoverer.get_source_name() == source_name
            for discoverer in self._discoverers
        )
    
    def get_discoverer(self, source_name: str) -> Optional[ToolDiscoverer]:
        """
        Get a discoverer by source name.
        
        Args:
            source_name: Name of the source
            
        Returns:
            ToolDiscoverer instance or None if not found
        """
        for discoverer in self._discoverers:
            if discoverer.get_source_name() == source_name:
                return discoverer
        return None
    
    def unregister_discoverer(self, source_name: str) -> bool:
        """
        Unregister a discovery mechanism.
        
        Args:
            source_name: Name of the source to remove
            
        Returns:
            True if discoverer was found and removed, False otherwise
        """
        for discoverer in self._discoverers:
            if discoverer.get_source_name() == source_name:
                self._discoverers.remove(discoverer)
                logger.info(f"Unregistered tool discoverer: {source_name}")
                return True
        return False
    
    def register_or_update_discoverer(self, discoverer: ToolDiscoverer) -> None:
        """
        Register a discoverer or update existing one if already registered.
        
        If a discoverer with the same source name exists, it will be unregistered
        first, then the new one will be registered. This ensures clean updates.
        
        Args:
            discoverer: ToolDiscoverer instance to register or update
        """
        source_name = discoverer.get_source_name()
        if self.has_discoverer(source_name):
            self.unregister_discoverer(source_name)
        self.register_discoverer(discoverer)
    
    async def discover_all_tools(self, force_refresh: bool = False) -> Dict[str, DiscoveredTool]:
        """
        Discover tools from all registered discoverers.
        
        Args:
            force_refresh: If True, force re-discovery even if already discovered
            
        Returns:
            Dictionary mapping tool names to DiscoveredTool objects
        """
        if not force_refresh and self._discovered_tools:
            return self._discovered_tools
        
        all_tools: Dict[str, DiscoveredTool] = {}
        
        for discoverer in self._discoverers:
            try:
                discovered = await discoverer.discover()
                
                for tool in discovered:
                    # Handle name conflicts (keep higher priority or first discovered)
                    if tool.name in all_tools:
                        existing = all_tools[tool.name]
                        if tool.priority < existing.priority:
                            logger.warning(
                                f"Tool '{tool.name}' already discovered from {existing.source}. "
                                f"Replacing with version from {tool.source} (higher priority)"
                            )
                            all_tools[tool.name] = tool
                        else:
                            logger.debug(
                                f"Skipping duplicate tool '{tool.name}' from {tool.source} "
                                f"(existing from {existing.source} has higher priority)"
                            )
                    else:
                        all_tools[tool.name] = tool
                
                # Only log if tools were actually discovered (skip empty sources)
                if len(discovered) > 0:
                    logger.debug(
                        f"Discovered {len(discovered)} tools from {discoverer.get_source_name()}"
                    )
            
            except Exception as e:
                logger.error(
                    f"Error discovering tools from {discoverer.get_source_name()}: {e}",
                    exc_info=True
                )
        
        self._discovered_tools = all_tools
        # Only log total if there are tools (avoid noise for empty discovery)
        if len(all_tools) > 0:
            logger.debug(f"Total tools discovered: {len(all_tools)}")
        return all_tools
    
    async def discover_tool(self, tool_name: str) -> Optional[DiscoveredTool]:
        """
        Discover a specific tool by name.
        
        Args:
            tool_name: Name of the tool to discover
            
        Returns:
            DiscoveredTool or None if not found
        """
        # Check if already discovered
        if tool_name in self._discovered_tools:
            return self._discovered_tools[tool_name]
        
        # Try discovering from all sources
        await self.discover_all_tools()
        return self._discovered_tools.get(tool_name)
    
    def get_discovered_tools(self) -> Dict[str, DiscoveredTool]:
        """
        Get all currently discovered tools.
        
        Returns:
            Dictionary of discovered tools
        """
        return self._discovered_tools.copy()
    
    def get_tools_by_source(self, source_name: str) -> List[DiscoveredTool]:
        """
        Get all tools from a specific source.
        
        Args:
            source_name: Name of the source
            
        Returns:
            List of tools from that source
        """
        return [
            tool for tool in self._discovered_tools.values()
            if tool.source == source_name
        ]


# Global discovery service instance
_discovery_service: Optional[ToolDiscoveryService] = None


def get_discovery_service() -> ToolDiscoveryService:
    """
    Get the global tool discovery service instance.
    
    Returns:
        ToolDiscoveryService instance
    """
    global _discovery_service
    if _discovery_service is None:
        _discovery_service = ToolDiscoveryService()
    return _discovery_service


def initialize_discovery_service() -> ToolDiscoveryService:
    """
    Initialize the global tool discovery service.
    
    Returns:
        Initialized ToolDiscoveryService instance
    """
    return get_discovery_service()

