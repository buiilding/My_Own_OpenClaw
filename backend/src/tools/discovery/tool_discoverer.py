"""
Tool Discoverer for discovering tools from various sources.

This module handles the discovery of tools (finding tool metadata, classes, etc.)
separate from the instantiation/loading logic. It coordinates with the unified
discovery service as the single source of truth.
"""
import logging
from pathlib import Path
from typing import Dict, List, Optional

from backend.src.core.config import AppConfig
from backend.src.tools.discovery.base import (
    DiscoveredTool,
    ToolDiscoveryService,
    get_discovery_service,
)
from backend.src.tools.discovery.core_definitions_discoverer import (
    CoreDefinitionsDiscoverer,
)
from backend.src.tools.discovery.marketplace_discoverer import MarketplaceToolDiscoverer
from backend.src.tools.registry import ToolMetadata

logger = logging.getLogger(__name__)


class ToolDiscoverer:
    """
    Handles discovery of tools from various sources.

    Separates discovery logic (finding tools) from loading logic (instantiating tools).
    Uses the unified discovery service as the single source of truth.
    """

    def __init__(
        self,
        config: AppConfig,
        marketplace_dir: Optional[Path] = None,
        discovery_service: Optional[ToolDiscoveryService] = None,
    ):
        """
        Initialize the tool discoverer.

        Args:
            config: Application configuration
            marketplace_dir: Optional marketplace directory path
            discovery_service: Optional ToolDiscoveryService instance (created if not provided)
        """
        self.config = config
        self.marketplace_dir = marketplace_dir

        # Initialize discovery service (always use unified discovery)
        if discovery_service is None:
            discovery_service = get_discovery_service()

            # Register discoverers (only core definitions for core tools, marketplace separately)
            # Entry points are optional and only registered if actually used
            discovery_service.register_discoverer(CoreDefinitionsDiscoverer())

        self.discovery_service = discovery_service

    async def discover_core_tools(self) -> List[DiscoveredTool]:
        """
        Discover core tools from core definitions.

        Uses unified discovery service to discover tools from core definitions.
        This is the single source of truth for built-in tool discovery.

        Returns:
            List of DiscoveredTool objects for core tools

        Raises:
            Exception: If discovery service fails (fail fast, no fallback)
        """
        try:
            # Only discover from core_definitions (built-in tools)
            core_discoverer = self.discovery_service.get_discoverer("core_definitions")
            if core_discoverer:
                core_tools = await core_discoverer.discover()
                return core_tools
            else:
                logger.warning("Core definitions discoverer not registered")
                return []
        except Exception as e:
            logger.error(f"Failed to discover core tools: {e}", exc_info=True)
            raise

    async def discover_marketplace_tools(
        self, marketplace_dir: Optional[Path] = None
    ) -> Dict[str, ToolMetadata]:
        """
        Discover marketplace tools and return metadata.

        Does NOT instantiate the tools, only returns metadata.
        Uses unified discovery service to discover marketplace tools.

        Args:
            marketplace_dir: Optional marketplace directory (uses instance default if not provided)

        Returns:
            Dictionary mapping tool names to ToolMetadata

        Raises:
            ValueError: If no marketplace directory is provided
            Exception: If discovery service fails (fail fast, no fallback)
        """
        dir_to_scan = marketplace_dir or self.marketplace_dir

        if not dir_to_scan:
            raise ValueError("No marketplace directory provided")

        # Ensure marketplace discoverer is registered with the correct directory
        # Use public API to check and update discoverer registration
        existing_discoverer = self.discovery_service.get_discoverer("marketplace")
        
        if existing_discoverer is None:
            # No marketplace discoverer registered, register a new one
            logger.info(f"Registering marketplace discoverer for {dir_to_scan}")
            self.discovery_service.register_discoverer(
                MarketplaceToolDiscoverer(dir_to_scan)
            )
        elif hasattr(existing_discoverer, "marketplace_dir") and existing_discoverer.marketplace_dir != dir_to_scan:
            # Marketplace discoverer exists but with different directory, update it
            logger.info(f"Updating marketplace discoverer directory from {existing_discoverer.marketplace_dir} to {dir_to_scan}")
            self.discovery_service.register_or_update_discoverer(
                MarketplaceToolDiscoverer(dir_to_scan)
            )

        try:
            # Only discover from marketplace discoverer (don't re-discover core tools)
            marketplace_discoverer = self.discovery_service.get_discoverer("marketplace")
            if not marketplace_discoverer:
                logger.warning("Marketplace discoverer not registered")
                return {}
            
            discovered_tools = await marketplace_discoverer.discover()
            marketplace_tools = discovered_tools

            # Convert to ToolMetadata format
            metadata_dict: Dict[str, ToolMetadata] = {}
            for tool in marketplace_tools:
                meta = tool.metadata or {}
                if "tool_dir" in meta:
                    from backend.src.tools.marketplace.discovery.validator import (
                        ToolManifest,
                    )

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

            logger.info(
                f"Discovered {len(metadata_dict)} marketplace tools via discovery service."
            )
            return metadata_dict
        except Exception as e:
            logger.error(f"Failed to discover marketplace tools: {e}", exc_info=True)
            raise
