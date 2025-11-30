"""
Tool Loader for orchestrating tool discovery and instantiation.

This module coordinates the discovery and loading of SDK tools. It delegates
discovery to ToolDiscoverer and handles tool instantiation using ToolInstantiator.
"""
import importlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.src.core.config import AppConfig
from backend.src.core.services import ServiceContainer
from backend.src.sdk.tool import Tool as SDKTool
from backend.src.tools.discovery.tool_discoverer import ToolDiscoverer
from backend.src.tools.loading.tool_instantiator import ToolInstantiator
from backend.src.tools.loading.tool_validator import ToolValidator
from backend.src.tools.registry import ToolMetadata

logger = logging.getLogger(__name__)


class ToolLoader:
    """
    Orchestrates the discovery and loading of SDK tools.

    Separates concerns:
    - Discovery: Delegated to ToolDiscoverer (finding tools)
    - Loading: Handles instantiation using ToolInstantiator (creating tool instances)
    """

    def __init__(
        self,
        config: AppConfig,
        service_container: Optional[ServiceContainer] = None,
        marketplace_dir: Optional[Path] = None,
        tool_validator: Optional[ToolValidator] = None,
        tool_instantiator: Optional[ToolInstantiator] = None,
        tool_discoverer: Optional[ToolDiscoverer] = None,
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
            tool_discoverer: Optional ToolDiscoverer instance (created if not provided)
        """
        self.config = config
        self.services = service_container or ServiceContainer(config)
        self.marketplace_dir = marketplace_dir

        # Use provided services or create new ones
        self.validator = tool_validator or ToolValidator()
        self.instantiator = tool_instantiator or ToolInstantiator()

        # Initialize tool discoverer (handles all discovery logic)
        if tool_discoverer is None:
            tool_discoverer = ToolDiscoverer(
                config=config,
                marketplace_dir=marketplace_dir,
            )

        self.discoverer = tool_discoverer

    async def load_core_tools(self) -> List[SDKTool]:
        """
        Discover and instantiate all core SDK tools.

        Uses ToolDiscoverer to discover tools, then instantiates them using
        ToolInstantiator. This is the orchestration layer that coordinates
        discovery and loading.

        Discovery failures propagate (fail fast). Individual tool instantiation
        failures are logged but don't prevent other tools from loading.

        Returns:
            List of instantiated SDK tool instances

        Raises:
            Exception: If discovery fails (no fallback)
        """
        # Discover core tools (delegated to ToolDiscoverer, fails fast on error)
        discovered_tools = await self.discoverer.discover_core_tools()

        # Instantiate tools (orchestration - individual failures are handled gracefully)
        loaded_tools: List[SDKTool] = []
        for discovered_tool in discovered_tools:
            if discovered_tool.tool_class is None:
                continue
            try:
                instance = self.instantiator.instantiate_tool(
                    discovered_tool.tool_class, tool_name=discovered_tool.name
                )
                if instance:
                    loaded_tools.append(instance)
            except Exception as e:
                logger.error(
                    f"Failed to instantiate core tool {discovered_tool.name}: {e}",
                    exc_info=True,
                )

        logger.info(f"Loaded {len(loaded_tools)} core SDK tools.")
        return loaded_tools

    async def scan_marketplace_tools(
        self, marketplace_dir: Optional[Path] = None
    ) -> Dict[str, ToolMetadata]:
        """
        Discover marketplace tools and return metadata.

        Does NOT instantiate the tools, only returns metadata.
        Delegates discovery to ToolDiscoverer.

        Args:
            marketplace_dir: Optional marketplace directory (uses instance default if not provided)

        Returns:
            Dictionary mapping tool names to ToolMetadata

        Raises:
            ValueError: If no marketplace directory is provided
            Exception: If discovery fails (no fallback)
        """
        return await self.discoverer.discover_marketplace_tools(marketplace_dir)

    async def load_marketplace_tool(self, metadata: ToolMetadata) -> Optional[SDKTool]:
        """
        Load and instantiate a specific marketplace SDK tool from its metadata.

        Args:
            metadata: ToolMetadata for the tool to load

        Returns:
            Instantiated SDK tool instance, or None if loading fails
        """
        try:
            # Import the module
            # Assumes structure: tools.verified.{dir_name}.tool
            module_name = f"tools.verified.{metadata.tool_dir.name}.tool"

            module = importlib.import_module(module_name)
            tool_class = getattr(module, metadata.manifest.tool_class)

            tool_instance = self.instantiator.instantiate_tool(
                tool_class, tool_name=metadata.name
            )
            return tool_instance

        except ImportError as e:
            logger.error(f"Failed to import module {module_name}: {e}")
        except AttributeError as e:
            logger.error(
                f"Tool class '{metadata.manifest.tool_class}' not found in module: {e}"
            )
        except Exception as e:
            logger.error(
                f"Failed to instantiate marketplace tool {metadata.name}: {e}",
                exc_info=True,
            )

        return None

    async def validate_marketplace_tool_security(
        self, tool_dir: Path, permissions: List[str]
    ):
        """
        Run the security scanner on a tool directory.

        Delegates to ToolValidator for security validation.

        Args:
            tool_dir: Directory containing the tool
            permissions: List of permissions to validate

        Returns:
            Security scan result
        """
        return await self.validator.validate_tool_security(tool_dir, permissions)
