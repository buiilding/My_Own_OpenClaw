"""
Marketplace Tool Discoverer.

Discovers marketplace tools from filesystem directories using manifest files.
Wraps the existing marketplace discovery logic.
"""
import logging
from pathlib import Path
from typing import List, Optional

from backend.src.tools.discovery.base import ToolDiscoverer, DiscoveredTool
from backend.src.tools.registry import ToolMetadata
from backend.src.tools.marketplace.discovery.validator import ToolManifestValidator
from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)


class MarketplaceToolDiscoverer(ToolDiscoverer):
    """
    Discovers marketplace tools from filesystem directories.
    
    Scans directories for manifest.json files and validates them,
    but does not instantiate tools (lazy loading).
    """
    
    def __init__(self, marketplace_dir: Path, validator: Optional[ToolManifestValidator] = None):
        """
        Initialize the marketplace discoverer.
        
        Args:
            marketplace_dir: Path to marketplace directory
            validator: Optional ToolManifestValidator instance
        """
        self.marketplace_dir = marketplace_dir
        self.validator = validator or ToolManifestValidator()
        self._metadata_cache: dict[str, ToolMetadata] = {}
    
    async def discover(self) -> List[DiscoveredTool]:
        """
        Discover tools from marketplace directory.
        
        Returns:
            List of discovered tools (with metadata, not instantiated)
        """
        discovered_tools: List[DiscoveredTool] = []
        
        if not self.marketplace_dir.exists():
            logger.warning(f"Marketplace directory not found: {self.marketplace_dir}")
            return discovered_tools
        
        logger.info(f"Scanning marketplace tools in {self.marketplace_dir}")
        
        for tool_dir in self.marketplace_dir.iterdir():
            if not tool_dir.is_dir() or tool_dir.name.startswith("."):
                continue
            
            metadata = await self._scan_tool_directory(tool_dir)
            if metadata:
                self._metadata_cache[metadata.name] = metadata
                
                # Create discovered tool (tool_class will be loaded lazily)
                discovered_tool = DiscoveredTool(
                    name=metadata.name,
                    tool_class=None,  # Will be loaded on demand
                    source="marketplace",
                    metadata={
                        "version": metadata.version,
                        "description": metadata.description,
                        "author": metadata.author,
                        "category": metadata.category,
                        "permissions": metadata.permissions,
                        "is_destructive": metadata.is_destructive,
                        "tool_dir": str(metadata.tool_dir),
                        "manifest_path": str(metadata.manifest_path),
                        "tool_class_name": metadata.manifest.tool_class,
                    },
                    priority=50  # Marketplace tools have medium priority
                )
                
                discovered_tools.append(discovered_tool)
        
        logger.info(f"Discovered {len(discovered_tools)} marketplace tools")
        return discovered_tools
    
    async def _scan_tool_directory(self, tool_dir: Path) -> Optional[ToolMetadata]:
        """
        Scan a single tool directory for manifest.
        
        Args:
            tool_dir: Tool directory path
            
        Returns:
            ToolMetadata or None if invalid
        """
        import json
        
        try:
            manifest_path = tool_dir / "manifest.json"
            if not manifest_path.exists():
                return None
            
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
            
            # Validate manifest
            val_result = self.validator.validate_manifest(manifest_data)
            if not val_result.is_valid:
                logger.warning(
                    f"Invalid manifest in {tool_dir.name}: {val_result.errors}"
                )
                return None
            
            manifest = val_result.manifest
            
            return ToolMetadata(
                name=manifest.name,
                version=manifest.version,
                description=manifest.description,
                author=manifest.author,
                category=manifest.category,
                permissions=manifest.permissions,
                is_destructive=manifest.is_destructive,
                tool_dir=tool_dir,
                manifest_path=manifest_path,
                security_status=None,
                manifest=manifest,
            )
        
        except Exception as e:
            logger.error(f"Error scanning {tool_dir.name}: {e}", exc_info=True)
            return None
    
    async def load_tool_class(self, tool_name: str) -> Optional[type[SDKTool]]:
        """
        Load the tool class for a marketplace tool.
        
        Args:
            tool_name: Name of the tool
            
        Returns:
            Tool class or None if not found/failed
        """
        if tool_name not in self._metadata_cache:
            # Try to discover it
            await self.discover()
        
        metadata = self._metadata_cache.get(tool_name)
        if not metadata:
            return None
        
        try:
            from pathlib import Path
            from backend.src.tools.loader import load_module_from_file
            
            # Use centralized module loading utility (shared with ToolLoader)
            tool_dir_path = Path(metadata.tool_dir)
            tool_file = tool_dir_path / "tool.py"
            module_name = f"tools.verified.{metadata.tool_dir.name}.tool"
            
            module = load_module_from_file(tool_file, module_name)
            if module is None:
                return None
            
            tool_class = getattr(module, metadata.manifest.tool_class)
            
            if not issubclass(tool_class, SDKTool):
                logger.error(
                    f"Tool class '{metadata.manifest.tool_class}' is not a Tool subclass"
                )
                return None
            
            return tool_class
        
        except ImportError as e:
            logger.error(f"Failed to import module for {tool_name}: {e}")
        except AttributeError as e:
            logger.error(
                f"Tool class '{metadata.manifest.tool_class}' not found: {e}"
            )
        except Exception as e:
            logger.error(f"Error loading tool class for {tool_name}: {e}", exc_info=True)
        
        return None
    
    def get_source_name(self) -> str:
        """Get the source name."""
        return "marketplace"

