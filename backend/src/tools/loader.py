"""
Tool Loader for discovering and loading SDK tools.

Enhanced with unified discovery service. 
Uses Entry Points and Core Definitions as sources of truth.
"""
import logging
import json
import importlib
from pathlib import Path
from typing import Dict, List, Optional, Any

from backend.src.core.config import AppConfig
from backend.src.core.services import ServiceContainer
from backend.src.sdk.tool import Tool as SDKTool
from backend.src.tools.registry import ToolMetadata
from backend.src.tools.loading.tool_validator import ToolValidator
from backend.src.tools.loading.tool_instantiator import ToolInstantiator

logger = logging.getLogger(__name__)


class ToolLoader:
    """
    Responsible for discovering and loading SDK tools from various sources
    (Internal definitions, Marketplace filesystem, etc.).
    """

    def __init__(
        self, 
        config: AppConfig,
        service_container: Optional[ServiceContainer] = None,
        marketplace_dir: Optional[Path] = None,
        tool_validator: Optional[ToolValidator] = None,
        tool_instantiator: Optional[ToolInstantiator] = None,
        discovery_service: Optional[Any] = None,
    ):
        """
        Initialize the tool loader.
        
        Args:
            config: Application configuration
            service_container: Optional ServiceContainer instance (created if not provided)
            marketplace_dir: Optional marketplace directory path
            tool_validator: Optional ToolValidator instance (created if not provided)
            tool_instantiator: Optional ToolInstantiator instance (created if not provided, 
                but should be injected via DI for proper tool_search_engine wiring)
            discovery_service: Optional ToolDiscoveryService instance (created if not provided)
        """
        self.config = config
        self.services = service_container or ServiceContainer(config)
        self.marketplace_dir = marketplace_dir
        
        # Use provided services or create new ones
        self.validator = tool_validator or ToolValidator()
        self.instantiator = tool_instantiator or ToolInstantiator()
        
        # Initialize discovery service (always use unified discovery)
        if discovery_service is None:
            from backend.src.tools.discovery.base import get_discovery_service
            from backend.src.tools.discovery.entry_point_discoverer import EntryPointToolDiscoverer
            from backend.src.tools.discovery.core_definitions_discoverer import CoreDefinitionsDiscoverer
            from backend.src.tools.discovery.marketplace_discoverer import MarketplaceToolDiscoverer
            
            discovery_service = get_discovery_service()
            
            # Register discoverers (entry points first, then core definitions, then marketplace)
            discovery_service.register_discoverer(EntryPointToolDiscoverer())
            discovery_service.register_discoverer(CoreDefinitionsDiscoverer())
            if marketplace_dir:
                discovery_service.register_discoverer(MarketplaceToolDiscoverer(marketplace_dir))
        
        self.discovery_service = discovery_service

    async def load_core_tools(self) -> List[SDKTool]:
        """
        Instantiates and returns all core SDK tools.
        
        Uses unified discovery service to discover tools from entry points
        and core definitions. This is the single source of truth for tool loading.
        
        This method is async and should be called from an async context.
        """
        try:
            # Use discovery service (async)
            discovered = await self.discovery_service.discover_all_tools()
            
            # Filter core tools (from entry points or core definitions)
            core_tools = [
                tool for tool in discovered.values()
                if tool.source in ("core", "core_definitions")
            ]
            
            # Instantiate tools
            loaded_tools: List[SDKTool] = []
            for discovered_tool in core_tools:
                if discovered_tool.tool_class is None:
                    continue
                try:
                    instance = self.instantiator.instantiate_tool(
                        discovered_tool.tool_class,
                        tool_name=discovered_tool.name
                    )
                    if instance:
                        loaded_tools.append(instance)
                except Exception as e:
                    logger.error(
                        f"Failed to instantiate core tool {discovered_tool.name}: {e}",
                        exc_info=True
                    )
            
            logger.info(f"Loaded {len(loaded_tools)} core SDK tools via discovery service.")
            return loaded_tools
            
        except Exception as e:
            logger.error(f"Failed to use discovery service: {e}", exc_info=True)
            return []

    async def scan_marketplace_tools(self, marketplace_dir: Optional[Path] = None) -> Dict[str, ToolMetadata]:
        """
        Scans the marketplace directory for valid tool manifests.
        Does NOT instantiate the tools, only returns metadata.
        
        Uses unified discovery service to discover marketplace tools.
        Falls back to filesystem scan if discovery fails.
        
        This method is async and should be called from an async context.
        """
        dir_to_scan = marketplace_dir or self.marketplace_dir
        
        if not dir_to_scan:
            logger.warning("No marketplace directory provided")
            return {}
        
        try:
            # Use discovery service (async)
            discovered = await self.discovery_service.discover_all_tools()
            marketplace_tools = [
                tool for tool in discovered.values()
                if tool.source == "marketplace"
            ]
            
            # Convert to ToolMetadata format (for backward compatibility)
            metadata_dict: Dict[str, ToolMetadata] = {}
            for tool in marketplace_tools:
                meta = tool.metadata or {}
                if "tool_dir" in meta:
                    from backend.src.tools.marketplace.discovery.validator import ToolManifest
                    manifest = ToolManifest(
                        name=tool.name,
                        version=meta.get("version", "1.0.0"),
                        description=meta.get("description", ""),
                        author=meta.get("author", ""),
                        category=meta.get("category", "utility"),
                        tool_class=meta.get("tool_class_name", ""),
                        permissions=meta.get("permissions", []),
                        is_destructive=meta.get("is_destructive", False),
                    )
                    metadata_dict[tool.name] = ToolMetadata(
                        name=tool.name,
                        version=meta.get("version", "1.0.0"),
                        description=meta.get("description", ""),
                        author=meta.get("author", ""),
                        category=meta.get("category", "utility"),
                        permissions=meta.get("permissions", []),
                        is_destructive=meta.get("is_destructive", False),
                        tool_dir=Path(meta["tool_dir"]),
                        manifest_path=Path(meta.get("manifest_path", "")),
                        security_status=None,
                        manifest=manifest,
                    )
            
            logger.info(f"Discovered {len(metadata_dict)} marketplace tools via discovery service.")
            return metadata_dict
            
        except Exception as e:
            logger.warning(f"Failed to use discovery service: {e}", exc_info=True)
            logger.info("Falling back to filesystem scan")
            return self._scan_marketplace_tools_sync(dir_to_scan)
    
    def _scan_marketplace_tools_sync(self, marketplace_dir: Optional[Path]) -> Dict[str, ToolMetadata]:
        """Backward compatibility: Use filesystem scanning."""
        if not marketplace_dir:
            logger.warning("No marketplace directory provided")
            return {}
        
        discovered_tools: Dict[str, ToolMetadata] = {}
        
        if not marketplace_dir.exists():
            logger.warning(f"Marketplace directory not found: {marketplace_dir}")
            return discovered_tools

        logger.info(f"Scanning marketplace tools in {marketplace_dir}")

        for tool_dir in marketplace_dir.iterdir():
            if not tool_dir.is_dir() or tool_dir.name.startswith("."):
                continue

            metadata = self._scan_single_tool_dir(tool_dir)
            if metadata:
                discovered_tools[metadata.name] = metadata

        logger.info(f"Discovered {len(discovered_tools)} marketplace tools.")
        return discovered_tools

    async def load_marketplace_tool(self, metadata: ToolMetadata) -> Optional[SDKTool]:
        """
        Loads and instantiates a specific marketplace SDK tool from its metadata.
        """
        try:
            # Import the module
            # Assumes structure: tools.verified.{dir_name}.tool
            module_name = f"tools.verified.{metadata.tool_dir.name}.tool"
            
            module = importlib.import_module(module_name)
            tool_class = getattr(module, metadata.manifest.tool_class)

            tool_instance = self.instantiator.instantiate_tool(tool_class, tool_name=metadata.name)
            return tool_instance

        except ImportError as e:
            logger.error(f"Failed to import module {module_name}: {e}")
        except AttributeError as e:
            logger.error(f"Tool class '{metadata.manifest.tool_class}' not found in module: {e}")
        except Exception as e:
            logger.error(f"Failed to instantiate marketplace tool {metadata.name}: {e}", exc_info=True)
        
        return None

    def _scan_single_tool_dir(self, tool_dir: Path) -> Optional[ToolMetadata]:
        """Helper to validate and scan a single tool directory."""
        try:
            manifest_path = tool_dir / "manifest.json"
            if not manifest_path.exists():
                return None

            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)

            # Validation
            val_result = self.validator.validate_manifest(manifest_data)
            if not val_result.is_valid:
                logger.warning(f"Invalid manifest in {tool_dir.name}: {val_result.errors}")
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
                security_status=None,  # To be filled by async scanner if needed
                manifest=manifest,
            )

        except Exception as e:
            logger.error(f"Error scanning {tool_dir.name}: {e}")
            return None

    async def validate_marketplace_tool_security(self, tool_dir: Path, permissions: List[str]):
        """
        Runs the security scanner on a tool directory.
        """
        return await self.validator.validate_tool_security(tool_dir, permissions)
