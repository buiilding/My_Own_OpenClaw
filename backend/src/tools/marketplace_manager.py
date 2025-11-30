"""
Marketplace Manager.

This module handles the discovery, loading, and caching of marketplace tools.
"""
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from backend.src.sdk.tool import Tool as SDKTool
from backend.src.tools.marketplace.discovery.security import SecurityScanResult
from backend.src.tools.marketplace.discovery.validator import ToolManifest

logger = logging.getLogger(__name__)


@dataclass
class ToolMetadata:
    """Metadata for a marketplace tool."""
    name: str
    version: str
    description: str
    author: str
    category: str
    permissions: list[str]
    is_destructive: bool
    tool_dir: Path
    manifest_path: Path
    security_status: SecurityScanResult
    manifest: ToolManifest


class MarketplaceManager:
    """Manages marketplace tools."""

    def __init__(self, tool_loader):
        self.tool_loader = tool_loader
        self.marketplace_tools: Dict[str, ToolMetadata] = {}
        self.marketplace_instances: Dict[str, SDKTool] = {}

    async def load_marketplace_tools(self, marketplace_dir: Path) -> Dict[str, ToolMetadata]:
        """
        Load all tools from the marketplace directory using the loader.
        """
        if not self.tool_loader:
            logger.error("ToolLoader not initialized")
            return {}

        self.marketplace_tools = await self.tool_loader.scan_marketplace_tools(marketplace_dir)
        return self.marketplace_tools

    async def get_marketplace_tool_instance(self, tool_name: str) -> Optional[SDKTool]:
        """
        Get a marketplace tool instance by name (lazy loading).
        """
        if tool_name not in self.marketplace_tools:
            return None

        # Return cached instance if available
        if tool_name in self.marketplace_instances:
            return self.marketplace_instances[tool_name]

        if not self.tool_loader:
            return None

        metadata = self.marketplace_tools[tool_name]
        
        tool_instance = await self.tool_loader.load_marketplace_tool(metadata)
        
        if tool_instance:
            self.marketplace_instances[tool_name] = tool_instance
            return tool_instance
            
        return None

    def get_all_instances(self) -> list[SDKTool]:
        """Get all instantiated marketplace tools."""
        return list(self.marketplace_instances.values())

    def get_available_tool_names(self) -> list[str]:
        """Get names of available marketplace tools."""
        return list(self.marketplace_tools.keys())

