"""
Core Definitions Tool Discoverer.

Discovers tools from the explicit CORE_TOOLS list in definitions.py.
This acts as the primary source for internal tools that are not yet migrated to entry points.
"""
import logging
from typing import List

from backend.src.tools.discovery.base import ToolDiscoverer, DiscoveredTool
from backend.src.tools.definitions import CORE_TOOLS
from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)


class CoreDefinitionsDiscoverer(ToolDiscoverer):
    """
    Discovers tools from the hardcoded CORE_TOOLS list.
    
    This ensures that tools defined in the codebase are always available,
    serving as a deterministic source of truth for core functionality.
    """
    
    async def discover(self) -> List[DiscoveredTool]:
        """
        Discover tools from CORE_TOOLS list.
        
        Returns:
            List of discovered tools
        """
        discovered_tools: List[DiscoveredTool] = []
        
        for tool_class in CORE_TOOLS:
            try:
                # Validate it's a tool class
                if not issubclass(tool_class, SDKTool):
                    logger.warning(
                        f"Class {tool_class.__name__} in CORE_TOOLS is not a Tool subclass"
                    )
                    continue
                
                # Get tool name from class
                tool_name = getattr(tool_class, "name", tool_class.__name__)
                
                discovered_tool = DiscoveredTool(
                    name=tool_name,
                    tool_class=tool_class,
                    source="core_definitions",
                    metadata={
                        "class_name": tool_class.__name__,
                        "module": tool_class.__module__,
                    },
                    priority=20 
                )
                
                discovered_tools.append(discovered_tool)
            
            except Exception as e:
                logger.error(
                    f"Error processing tool class {tool_class.__name__}: {e}",
                    exc_info=True
                )
                continue
        
        tool_names = [dt.name for dt in discovered_tools]
        logger.info(
            f"Discovered {len(discovered_tools)} tools from core definitions: "
            f"{', '.join(tool_names)}"
        )
        return discovered_tools
    
    def get_source_name(self) -> str:
        """Get the source name."""
        return "core_definitions"
