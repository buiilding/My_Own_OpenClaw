"""
Marketplace Registry for the Desktop Assistant.

This module manages the discovery, loading, and instantiation of
community tools from the tools/verified directory.
"""

import importlib.util
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.config import AppServices, get_settings
from backend.tools.base import Tool

from .discovery import (
    SecurityScanResult,
    ToolManifest,
    ToolManifestValidator,
    ToolSecurityScanner,
    ValidationResult,
)

logger = logging.getLogger(__name__)


@dataclass
class ToolMetadata:
    """Metadata for a marketplace tool."""

    name: str
    version: str
    description: str
    author: str
    category: str
    permissions: List[str]
    is_destructive: bool
    tool_dir: Path
    manifest_path: Path
    security_status: SecurityScanResult
    manifest: ToolManifest


class MarketplaceRegistry:
    """Manages community tools in the marketplace."""

    def __init__(self, marketplace_dir: Optional[Path] = None):
        """
        Initialize the marketplace registry.

        Args:
            marketplace_dir: Path to the marketplace directory (default: tools/verified)
        """
        if marketplace_dir is None:
            # Default to tools/verified relative to project root
            project_root = Path(__file__).parent.parent.parent
            marketplace_dir = project_root / "tools" / "verified"

        self.marketplace_dir = Path(marketplace_dir)
        self.tools: Dict[str, ToolMetadata] = {}  # tool_name -> ToolMetadata
        self.instances: Dict[str, Tool] = {}  # tool_name -> Tool instance (lazy loaded)
        self._security_scanner = ToolSecurityScanner()
        self._validator = ToolManifestValidator()

        # Ensure marketplace directory exists
        self.marketplace_dir.mkdir(parents=True, exist_ok=True)

    async def load_marketplace_tools(self) -> Dict[str, ToolMetadata]:
        """
        Load all tools from the marketplace directory.

        Returns:
            Dictionary mapping tool names to ToolMetadata
        """
        loaded_tools = {}

        if not self.marketplace_dir.exists():
            logger.warning(
                f"Marketplace directory does not exist: {self.marketplace_dir}"
            )
            return loaded_tools

        logger.info(f"Loading marketplace tools from {self.marketplace_dir}")

        for tool_dir in self.marketplace_dir.iterdir():
            if not tool_dir.is_dir() or tool_dir.name.startswith("."):
                continue

            try:
                # Load tool manifest
                manifest_path = tool_dir / "manifest.json"
                if not manifest_path.exists():
                    logger.warning(f"No manifest.json found for {tool_dir.name}")
                    continue

                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest_data = json.load(f)

                # Validate manifest
                validation_result = self._validator.validate_manifest(manifest_data)
                if not validation_result.is_valid:
                    logger.error(
                        f"Invalid manifest for {tool_dir.name}: {', '.join(validation_result.errors)}"
                    )
                    continue

                manifest = validation_result.manifest
                if manifest is None:
                    logger.error(f"Manifest validation failed for {tool_dir.name}")
                    continue

                # Perform security scan
                security_result = await self._security_scanner.scan_tool_directory(
                    tool_dir, manifest.permissions
                )
                if not security_result.is_safe:
                    logger.error(
                        f"Security scan failed for {tool_dir.name}: {len(security_result.issues)} issue(s)"
                    )
                    for issue in security_result.issues:
                        logger.error(f"  - {issue.get('message', 'Unknown issue')}")
                    continue

                # Log warnings if any
                if security_result.warnings:
                    for warning in security_result.warnings:
                        logger.warning(
                            f"Security warning for {tool_dir.name}: {warning}"
                        )

                # Create tool metadata
                metadata = ToolMetadata(
                    name=manifest.name,
                    version=manifest.version,
                    description=manifest.description,
                    author=manifest.author,
                    category=manifest.category,
                    permissions=manifest.permissions,
                    is_destructive=manifest.is_destructive,
                    tool_dir=tool_dir,
                    manifest_path=manifest_path,
                    security_status=security_result,
                    manifest=manifest,
                )

                loaded_tools[metadata.name] = metadata
                logger.info(
                    f"Loaded marketplace tool: {metadata.name} v{metadata.version}"
                )

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse manifest.json for {tool_dir.name}: {e}")
                continue
            except Exception as e:
                logger.error(f"Failed to load tool {tool_dir.name}: {e}", exc_info=True)
                continue

        self.tools = loaded_tools
        logger.info(f"Loaded {len(loaded_tools)} marketplace tools")
        return loaded_tools

    async def get_tool_instance(self, tool_name: str) -> Optional[Tool]:
        """
        Get a tool instance by name (lazy loading).

        Args:
            tool_name: Name of the tool to retrieve

        Returns:
            Tool instance or None if not found
        """
        if tool_name not in self.tools:
            return None

        # Return cached instance if available
        if tool_name in self.instances:
            return self.instances[tool_name]

        metadata = self.tools[tool_name]

        try:
            # Dynamically import and instantiate the tool
            tool_module = await self._load_tool_module(metadata)
            tool_class = getattr(tool_module, metadata.manifest.tool_class)

            # Create AppServices instance for the tool
            services = AppServices(get_settings())

            # Instantiate the tool
            tool_instance = tool_class(services)

            # Verify it's a Tool instance
            if not isinstance(tool_instance, Tool):
                logger.error(
                    f"Tool class {metadata.manifest.tool_class} does not inherit from Tool base class"
                )
                return None

            # Cache the instance
            self.instances[tool_name] = tool_instance
            logger.debug(f"Instantiated marketplace tool: {tool_name}")

            return tool_instance

        except AttributeError as e:
            logger.error(
                f"Tool class '{metadata.manifest.tool_class}' not found in {metadata.tool_dir}: {e}"
            )
            return None
        except Exception as e:
            logger.error(f"Failed to instantiate tool {tool_name}: {e}", exc_info=True)
            return None

    async def _load_tool_module(self, metadata: ToolMetadata):
        """
        Load a tool module from its directory.

        Args:
            metadata: Tool metadata

        Returns:
            Loaded module
        """
        tool_dir = metadata.tool_dir
        tool_py = tool_dir / "tool.py"

        if not tool_py.exists():
            raise FileNotFoundError(f"tool.py not found in {tool_dir}")

        # Create unique module name
        module_name = f"marketplace_tool_{metadata.name}"

        # Check if module already loaded
        if module_name in sys.modules:
            return sys.modules[module_name]

        # Add tool directory to Python path temporarily
        original_path = sys.path.copy()
        try:
            sys.path.insert(0, str(tool_dir))

            # Import the module
            spec = importlib.util.spec_from_file_location(module_name, tool_py)
            if spec is None or spec.loader is None:
                raise ImportError(f"Could not create spec for {tool_py}")

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)

            return module

        finally:
            # Restore original path
            sys.path[:] = original_path

    def get_tool_schema(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """
        Get the JSON schema for a marketplace tool.

        Args:
            tool_name: Name of the tool

        Returns:
            JSON schema dictionary or None
        """
        # Get tool instance (lazy load if needed)
        # Note: This is a sync method, so we need to handle async loading
        # For now, we'll require tools to be pre-loaded or use a sync approach
        if tool_name not in self.tools:
            return None

        # Try to get cached instance
        if tool_name not in self.instances:
            # Cannot lazy load in sync context - return None or use manifest schema
            # For now, return None and let caller handle async loading
            logger.warning(f"Tool {tool_name} not instantiated yet, cannot get schema")
            return None

        tool = self.instances[tool_name]
        try:
            return tool.get_schema()
        except Exception as e:
            logger.error(f"Failed to get schema for {tool_name}: {e}")
            return None

    async def get_all_tool_schemas(self) -> List[Dict[str, Any]]:
        """
        Get schemas for all loaded marketplace tools.

        Returns:
            List of tool schema dictionaries
        """
        schemas = []
        for tool_name in self.tools.keys():
            # Ensure tool is instantiated
            tool = await self.get_tool_instance(tool_name)
            if tool:
                try:
                    schema = tool.get_schema()
                    schemas.append(schema)
                except Exception as e:
                    logger.error(f"Failed to get schema for {tool_name}: {e}")
                    continue
        return schemas

    def get_tool_metadata(self, tool_name: str) -> Optional[ToolMetadata]:
        """
        Get metadata for a tool.

        Args:
            tool_name: Name of the tool

        Returns:
            ToolMetadata or None
        """
        return self.tools.get(tool_name)

    def list_tools(self) -> List[str]:
        """
        List all available marketplace tool names.

        Returns:
            List of tool names
        """
        return list(self.tools.keys())

    def get_tool_count(self) -> int:
        """Get the number of loaded marketplace tools."""
        return len(self.tools)
