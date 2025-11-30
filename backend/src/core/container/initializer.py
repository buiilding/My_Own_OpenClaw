"""
Container Initializer.

Handles async initialization of container components including memory store,
tool loading, and search engine indexing.
"""
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class ContainerInitializer:
    """
    Handles async initialization of container components.

    Separates initialization logic from DI container configuration.
    """

    def __init__(self, container: Any):
        """
        Initialize the container initializer.

        Args:
            container: Container instance to initialize
        """
        self.container = container

    async def initialize(self) -> None:
        """
        Perform async initialization of container components.

        This includes:
        - Memory store initialization
        - Core tool loading
        - Marketplace tool loading
        - Tool search engine indexing
        """
        # Initialize memory store if available
        if self.container.memory_store and hasattr(
            self.container.memory_store, "initialize"
        ):
            await self.container.memory_store.initialize()

        # Load core tools asynchronously (deferred from ToolRegistry.__init__)
        await self.container.tool_registry.load_core_tools_async()

        # Load marketplace tools
        project_root = Path(__file__).parent.parent.parent.parent
        marketplace_dir = project_root / "tools" / "verified"

        await self.container.tool_registry.load_marketplace_tools(marketplace_dir)

        # Index tools for search
        if self.container.tool_search_engine:
            self.container.tool_search_engine.index_tools()

        logger.info("Container initialization complete")
