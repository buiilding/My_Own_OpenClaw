"""
Entry Point Tool Discoverer.

Discovers core tools using setuptools entry points, allowing tools to be
registered without modifying central definition files.
"""
import logging
from typing import List, Optional

try:
    from importlib.metadata import entry_points
except ImportError:
    # Fallback for Python < 3.8
    try:
        from importlib_metadata import entry_points
    except ImportError:
        entry_points = None

from backend.src.tools.discovery.base import ToolDiscoverer, DiscoveredTool
from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)


class EntryPointToolDiscoverer(ToolDiscoverer):
    """
    Discovers tools via setuptools entry points.
    
    Tools register themselves using the entry point group:
    'desktop_assistant.core_tools'
    
    Example setup.py:
        entry_points={
            'desktop_assistant.core_tools': [
                'my_tool = mypackage.tools:MyTool',
            ],
        }
    """
    
    def __init__(self, entry_point_group: str = "desktop_assistant.core_tools"):
        """
        Initialize the entry point discoverer.
        
        Args:
            entry_point_group: Entry point group name
        """
        self.entry_point_group = entry_point_group
    
    async def discover(self) -> List[DiscoveredTool]:
        """
        Discover tools from entry points.
        
        Returns:
            List of discovered tools
        """
        if entry_points is None:
            logger.warning(
                "importlib.metadata not available. Entry point discovery disabled. "
                "This requires Python 3.8+ or install importlib-metadata."
            )
            return []

        discovered_tools: List[DiscoveredTool] = []

        try:
            # Get entry points for the specific group
            eps = entry_points()
            if hasattr(eps, 'select'):  # Python 3.10+
                group_eps = eps.select(group=self.entry_point_group)
            else:  # Python 3.8-3.9
                group_eps = eps.get(self.entry_point_group, [])

            for entry_point in group_eps:
                try:
                    tool_class = entry_point.load()
                    
                    # Validate it's a tool class
                    if not issubclass(tool_class, SDKTool):
                        logger.warning(
                            f"Entry point '{entry_point.name}' does not point to a Tool subclass. "
                            f"Got: {tool_class}"
                        )
                        continue
                    
                    # Get tool name from class
                    tool_name = getattr(tool_class, "name", entry_point.name)
                    
                    discovered_tool = DiscoveredTool(
                        name=tool_name,
                        tool_class=tool_class,
                        source="core",
                        metadata={
                            "entry_point": entry_point.name,
                            "module": entry_point.module_name,
                            "dist": entry_point.dist.project_name if entry_point.dist else None,
                        },
                        priority=10  # Core tools have high priority
                    )
                    
                    discovered_tools.append(discovered_tool)
                    logger.debug(f"Discovered core tool via entry point: {tool_name}")
                
                except Exception as e:
                    logger.error(
                        f"Error loading entry point '{entry_point.name}': {e}",
                        exc_info=True
                    )
                    continue
        
        except Exception as e:
            logger.error(f"Error discovering entry points: {e}", exc_info=True)
        
        logger.info(f"Discovered {len(discovered_tools)} tools from entry points")
        return discovered_tools
    
    def get_source_name(self) -> str:
        """Get the source name."""
        return "core"

