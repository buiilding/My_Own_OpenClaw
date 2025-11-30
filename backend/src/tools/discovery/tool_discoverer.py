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
from backend.src.tools.discovery.entry_point_discoverer import EntryPointToolDiscoverer
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

            # Register discoverers (entry points first, then core definitions, then marketplace)
            discovery_service.register_discoverer(EntryPointToolDiscoverer())
            discovery_service.register_discoverer(CoreDefinitionsDiscoverer())
            if marketplace_dir:
                discovery_service.register_discoverer(
                    MarketplaceToolDiscoverer(marketplace_dir)
                )

        self.discovery_service = discovery_service

    async def discover_core_tools(self) -> List[DiscoveredTool]:
        """
        Discover core tools from entry points and core definitions.

        Uses unified discovery service to discover tools from entry points
        and core definitions. This is the single source of truth for tool discovery.

        Returns:
            List of DiscoveredTool objects for core tools

        Raises:
            Exception: If discovery service fails (fail fast, no fallback)
        """
        try:
            discovered = await self.discovery_service.discover_all_tools()

            # Filter core tools (from entry points or core definitions)
            core_tools = [
                tool
                for tool in discovered.values()
                if tool.source in ("core", "core_definitions")
            ]

            logger.info(
                f"Discovered {len(core_tools)} core tools via discovery service."
            )
            return core_tools
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

        try:
            # Use discovery service (async)
            discovered = await self.discovery_service.discover_all_tools()
            marketplace_tools = [
                tool for tool in discovered.values() if tool.source == "marketplace"
            ]

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
