"""
Tool Loader for orchestrating tool discovery and instantiation.

This module coordinates the discovery and loading of SDK tools. It delegates
discovery to ToolDiscoverer and handles tool instantiation using ToolInstantiator.
"""
import importlib.util
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Type

from backend.src.core.config import AppConfig
from backend.src.core.services import ServiceContainer
from backend.src.sdk.tool import Tool as SDKTool
from backend.src.tools.discovery.tool_discoverer import ToolDiscoverer
from backend.src.tools.loading.tool_instantiator import ToolInstantiator
from backend.src.tools.loading.tool_validator import ToolValidator
from backend.src.tools.registry import ToolMetadata

logger = logging.getLogger(__name__)


def _find_project_root(start_path: Path) -> Optional[Path]:
    """
    Find the project root directory by looking for 'backend' directory.
    
    Args:
        start_path: Starting path to search from
        
    Returns:
        Project root path (parent of backend/) or None if not found
    """
    current = start_path.resolve()
    while current.parent != current:  # Stop at filesystem root
        if (current / "backend").exists() and (current / "backend").is_dir():
            return current
        current = current.parent
    return None


def _ensure_parent_packages(
    module_name: str, 
    tool_file: Path, 
    sys_modules: dict
) -> None:
    """
    Register parent packages in sys.modules for proper relative import resolution.
    
    Args:
        module_name: Full module name (e.g., "tools.verified.coact_automation.tool")
        tool_file: Path to the module file
        sys_modules: sys.modules dictionary to update
    """
    from types import ModuleType
    
    parts = module_name.split('.')
    if len(parts) < 2:
        return  # No parent packages to register
    
    # Start from the tool file's directory
    # For "tools.verified.coact_automation.tool", tool_file.parent is the package directory
    package_dir = tool_file.parent
    
    # Register each parent package from innermost to outermost
    # e.g., for "tools.verified.coact_automation.tool":
    # 1. tools.verified.coact_automation (package_dir)
    # 2. tools.verified (package_dir.parent)
    # 3. tools (package_dir.parent.parent)
    for i in range(len(parts) - 1, 0, -1):  # Count down from len-1 to 1
        parent_name = '.'.join(parts[:i])
        
        if parent_name not in sys_modules:
            parent_module = ModuleType(parent_name)
            parent_module.__path__ = [str(package_dir)]
            parent_module.__package__ = parent_name
            
            # Set __file__ if __init__.py exists
            init_file = package_dir / "__init__.py"
            if init_file.exists():
                parent_module.__file__ = str(init_file)
            
            sys_modules[parent_name] = parent_module
        
        # Move up one directory level for next parent package
        package_dir = package_dir.parent


def load_module_from_file(tool_file: Path, module_name: str) -> Optional[Any]:
    """
    Load a Python module from a file path with proper package context.
    
    This function ensures parent packages are registered in sys.modules before
    loading, enabling relative imports to work correctly.
    
    Args:
        tool_file: Path to the Python file to load
        module_name: Full module name (e.g., "tools.verified.coact_automation.tool")
        
    Returns:
        Loaded module object, or None if loading fails
    """
    if not tool_file.exists():
        logger.error(f"Module file not found: {tool_file}")
        return None
    
    try:
        import sys
        
        # Find project root for sys.path (enables absolute imports like backend.src.*)
        project_root = _find_project_root(tool_file)
        path_added = False
        
        if project_root:
            project_root_str = str(project_root)
            if project_root_str not in sys.path:
                sys.path.insert(0, project_root_str)
                path_added = True
        
        try:
            # Register parent packages before loading
            _ensure_parent_packages(module_name, tool_file, sys.modules)
            
            # Load the module
            spec = importlib.util.spec_from_file_location(module_name, tool_file)
            if spec is None or spec.loader is None:
                logger.error(f"Could not create module spec for {tool_file}")
                return None
            
            module = importlib.util.module_from_spec(spec)
            
            # Set __package__ for relative imports
            parts = module_name.split('.')
            if len(parts) > 1:
                module.__package__ = '.'.join(parts[:-1])
            
            # Register module before execution (needed for relative imports)
            sys.modules[module_name] = module
            
            spec.loader.exec_module(module)
            return module
            
        finally:
            # Clean up sys.path if we added it
            if path_added and project_root_str in sys.path:
                sys.path.remove(project_root_str)
        
    except Exception as e:
        logger.error(
            f"Failed to load module from {tool_file}: {e}",
            exc_info=True
        )
        return None


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
        failed_tools: List[str] = []
        
        for discovered_tool in discovered_tools:
            # Core tools always have tool_class (from CORE_TOOLS list)
            try:
                instance = self.instantiator.instantiate_tool(
                    discovered_tool.tool_class, tool_name=discovered_tool.name
                )
                if instance:
                    loaded_tools.append(instance)
            except Exception as e:
                failed_tools.append(discovered_tool.name)
                logger.error(
                    f"Failed to instantiate core tool {discovered_tool.name}: {e}",
                    exc_info=True,
                )

        tool_names = [tool.name for tool in loaded_tools]
        logger.info(
            f"Loaded {len(loaded_tools)} core SDK tools: {', '.join(tool_names)}"
        )
        if failed_tools:
            logger.warning(f"Failed to load {len(failed_tools)} tools: {', '.join(failed_tools)}")
        
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

    def _load_marketplace_tool_class(self, metadata: ToolMetadata) -> Optional[Type[SDKTool]]:
        """
        Load a marketplace tool class (without instantiating).
        
        This is a shared helper used by both async and sync loading paths.
        Uses the centralized module loading utility for consistency.
        
        Args:
            metadata: ToolMetadata for the tool to load
            
        Returns:
            Tool class or None if loading fails
        """
        tool_dir_path = Path(metadata.tool_dir)
        tool_file = tool_dir_path / "tool.py"
        module_name = f"tools.verified.{metadata.tool_dir.name}.tool"
        
        # Use centralized module loading utility
        module = load_module_from_file(tool_file, module_name)
        if module is None:
            return None
        
        try:
            tool_class = getattr(module, metadata.manifest.tool_class)
            
            if not issubclass(tool_class, SDKTool):
                logger.error(
                    f"Tool class '{metadata.manifest.tool_class}' is not a Tool subclass"
                )
                return None
                
            return tool_class
            
        except AttributeError as e:
            logger.error(
                f"Tool class '{metadata.manifest.tool_class}' not found in module for {metadata.name}: {e}"
            )
            return None
        except Exception as e:
            logger.error(
                f"Failed to load marketplace tool class {metadata.name}: {e}",
                exc_info=True,
            )
            return None
    
    async def load_marketplace_tool(self, metadata: ToolMetadata) -> Optional[SDKTool]:
        """
        Load and instantiate a specific marketplace SDK tool from its metadata.

        Args:
            metadata: ToolMetadata for the tool to load

        Returns:
            Instantiated SDK tool instance, or None if loading fails
        """
        tool_class = self._load_marketplace_tool_class(metadata)
        if not tool_class:
            return None
        
        try:
            tool_instance = self.instantiator.instantiate_tool(
                tool_class, tool_name=metadata.name
            )
            return tool_instance
        except Exception as e:
            logger.error(
                f"Failed to instantiate marketplace tool {metadata.name}: {e}",
                exc_info=True,
            )
            return None
    
    def load_marketplace_tool_sync(self, metadata: ToolMetadata) -> Optional[SDKTool]:
        """
        Load and instantiate a marketplace tool synchronously (for schema generation).
        
        This is used when we need tool instances synchronously, such as during
        schema generation in get_all_tools(). Uses the same loading logic as
        the async version but executes synchronously.
        
        Args:
            metadata: ToolMetadata for the tool to load
            
        Returns:
            Instantiated SDK tool instance, or None if loading fails
        """
        tool_class = self._load_marketplace_tool_class(metadata)
        if not tool_class:
            return None
        
        try:
            tool_instance = self.instantiator.instantiate_tool(
                tool_class, tool_name=metadata.name
            )
            return tool_instance
        except Exception as e:
            # Use warning level for schema generation failures so they're visible
            # Schema generation failures prevent tools from appearing in system prompt
            logger.warning(
                f"Could not load marketplace tool {metadata.name} for schema generation: {e}",
                exc_info=True
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
