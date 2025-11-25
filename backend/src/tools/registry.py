"""
Tool Registry for the Desktop Assistant.

This module manages the registration, discovery, and provision of tools,
including both built-in tools and community tools from the marketplace.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.src.sdk.tool import Tool as SDKTool
from backend.src.core.security.executor import get_tool_executor
from backend.src.core.services.context_factory import ContextFactory
from backend.src.tools.categorization import ToolDomain, get_categorizer
from backend.src.tools.lifecycle import ToolLifecycleManager

# Marketplace Discovery
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
    permissions: List[str]
    is_destructive: bool
    tool_dir: Path
    manifest_path: Path
    security_status: SecurityScanResult
    manifest: ToolManifest


class ToolRegistry:
    """
    Registry for managing available SDK tools.

    Provides tool registration, schema generation, and tool execution
    capabilities for the agent system. Supports both built-in tools and
    dynamically loaded marketplace tools.
    """

    def __init__(
        self,
        config: Any,
        tool_loader: Optional[Any] = None,
        context_factory: Optional[ContextFactory] = None,
    ):
        """
        Initialize the tool registry.

        Args:
            config: Application configuration object
            tool_loader: Optional ToolLoader instance
            context_factory: Optional ContextFactory instance (created if not provided)
        """
        self.config = config
        self.tools: Dict[str, SDKTool] = {}
        
        # Marketplace
        self.marketplace_tools: Dict[str, ToolMetadata] = {}
        self.marketplace_instances: Dict[str, SDKTool] = {}
        
        self.tool_loader = tool_loader
        self.executor = get_tool_executor()
        self.categorizer = get_categorizer()
        self.lifecycle_manager = ToolLifecycleManager(tool_registry=self)
        
        # Initialize context factory (create if not provided)
        if context_factory is None:
            self.context_factory = ContextFactory(
                config=config,
                tool_registry=self,
                tool_loader=tool_loader,
            )
        else:
            self.context_factory = context_factory
        
        # Tool loading is deferred to async initialization
        # Call load_core_tools_async() from Container.initialize()

    def register_tool(self, tool: SDKTool) -> None:
        """
        Register a tool in the registry.

        Args:
            tool: The SDK tool to register
        """
        if tool.name in self.tools:
            logger.warning(f"Tool '{tool.name}' is already registered. Overwriting.")
        self.tools[tool.name] = tool
        logger.debug(f"Registered tool: {tool.name}")

    async def load_core_tools_async(self) -> None:
        """
        Load core tools asynchronously.
        
        This should be called from Container.initialize() during async startup.
        """
        if not self.tool_loader:
            logger.warning("ToolLoader not initialized, skipping core tool loading")
            return
        
        try:
            core_tools = await self.tool_loader.load_core_tools()
            for tool in core_tools:
                self.register_tool(tool)
            logger.info(f"Loaded {len(core_tools)} core tools into registry")
        except Exception as e:
            logger.error(f"Failed to load core tools: {e}", exc_info=True)

    async def load_marketplace_tools(self, marketplace_dir: Path) -> Dict[str, ToolMetadata]:
        """
        Load all tools from the marketplace directory using the loader.
        
        This method is async and should be called from an async context.
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

    def get_tool(self, name: str) -> Optional[SDKTool]:
        """
        Get a tool by name.

        Checks built-in tools first, then marketplace tools if not found.

        Args:
            name: Name of the tool to retrieve

        Returns:
            The SDK tool instance, or None if not found
        """
        # First check built-in tools
        tool = self.tools.get(name)
        if tool:
            return tool

        # Check marketplace if available
        if name in self.marketplace_instances:
            return self.marketplace_instances[name]
            
        return None

    def get_all_tools(self) -> List[SDKTool]:
        """
        Get all registered tools (built-in + instantiated marketplace).

        Returns:
            List of all registered SDK tools
        """
        all_tools = list(self.tools.values())
        all_tools.extend(self.marketplace_instances.values())
        return all_tools

    def get_tool_names(self) -> List[str]:
        """
        Get names of all registered tools.

        Returns:
            List of tool names
        """
        names = list(self.tools.keys())
        names.extend(self.marketplace_tools.keys())
        return sorted(list(set(names)))

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """
        Get function declarations (schemas) for all tools.
        Uses caching to avoid regenerating schemas.

        This is used to provide tool schemas to LLMs.
        Includes both built-in tools and marketplace tools.

        Returns:
            List of function declaration dictionaries
        """
        from backend.src.core.cache import cache_manager
        
        declarations = []
        # Add built-in tool schemas
        for tool in self.tools.values():
            try:
                # Try cache first
                cache_key = cache_manager.get_tool_schema_key(tool.name)
                schema = cache_manager.tool_schemas.get(cache_key)
                
                if schema is None:
                    # Cache miss - generate schema
                    schema = tool.get_json_schema()
                    cache_manager.tool_schemas.set(cache_key, schema)
                
                declarations.append(schema)
            except Exception as e:
                logger.error(f"Failed to get schema for tool {tool.name}: {e}")
                continue

        # Add marketplace tool schemas if available
        for tool_name, tool in self.marketplace_instances.items():
            try:
                # Try cache first
                cache_key = cache_manager.get_tool_schema_key(tool_name)
                schema = cache_manager.tool_schemas.get(cache_key)
                
                if schema is None:
                    # Cache miss - generate schema
                    schema = tool.get_json_schema()
                    cache_manager.tool_schemas.set(cache_key, schema)
                
                declarations.append(schema)
            except Exception as e:
                logger.error(
                    f"Failed to get schema for marketplace tool {tool_name}: {e}"
                )
                continue

        return declarations

    def get_function_declarations_filtered(
        self, tool_names: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Get function declarations for specific tools.
        Uses caching to avoid regenerating schemas.

        Args:
            tool_names: List of tool names to include

        Returns:
            List of function declarations for the specified tools
        """
        from backend.src.core.cache import cache_manager
        
        declarations = []
        for name in tool_names:
            tool = self.get_tool(name)
            if tool:
                try:
                    # Try cache first
                    cache_key = cache_manager.get_tool_schema_key(name)
                    schema = cache_manager.tool_schemas.get(cache_key)
                    
                    if schema is None:
                        # Cache miss - generate schema
                        schema = tool.get_json_schema()
                        cache_manager.tool_schemas.set(cache_key, schema)
                    
                    declarations.append(schema)
                except Exception as e:
                    logger.error(f"Failed to get schema for tool {name}: {e}")
                    continue
        return declarations

    async def execute_tool(
        self, 
        tool_name: str, 
        parameters: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute a tool by name using SDK execution pattern.

        Args:
            tool_name: Name of the tool to execute
            parameters: Tool parameters (dict)
            user_id: User ID for context
            session_id: Session ID for context
            workspace_root: Workspace root path (defaults to current working directory)

        Returns:
            Dictionary with execution result (success, data, error, llm_content, etc.)
        """
        tool = self.get_tool(tool_name)

        # If not found in built-in or instantiated marketplace tools, try to load from marketplace
        if not tool and tool_name in self.marketplace_tools:
            try:
                tool = await self.get_marketplace_tool_instance(tool_name)
            except Exception as e:
                logger.error(f"Error loading marketplace tool {tool_name}: {e}")

        if not tool:
            return {
                "success": False,
                "error": f"Tool '{tool_name}' not found",
                "llm_content": f"Error: Tool '{tool_name}' not found",
                "return_display": f"Tool '{tool_name}' not found"
            }

        try:
            # Extract context parameters from kwargs
            user_id = kwargs.get("user_id", "default_user")
            session_id = kwargs.get("session_id", "default_session")
            workspace_root = kwargs.get("workspace_root")
            
            # Validate parameters using Pydantic
            try:
                args = tool.args_model(**(parameters or {}))
            except Exception as e:
                error_msg = f"Invalid parameters: {str(e)}"
                return {
                    "success": False,
                    "error": error_msg,
                    "llm_content": f"Error: {error_msg}",
                    "return_display": error_msg
                }

            # Build execution context using ContextFactory
            session_ref = kwargs.get("session_ref")
            context = self.context_factory.create_tool_context(
                user_id=user_id,
                session_id=session_id,
                workspace_root=workspace_root,
                session_ref=session_ref,
            )

            # Execute the tool via executor
            logger.info(f"Executing SDK tool {tool_name} with parameters: {parameters}")
            result = await self.executor.execute(tool, args, context)
            
            # Ensure result is a dict with success field
            if isinstance(result, dict):
                if "success" not in result:
                    result["success"] = "error" not in result
                return result
            else:
                # Wrap non-dict results
                return {
                    "success": True,
                    "data": result,
                    "llm_content": str(result),
                    "return_display": str(result)
                }

        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Tool execution failed: {str(e)}",
                "llm_content": f"Error: Tool execution failed: {str(e)}",
                "return_display": f"Tool execution failed: {str(e)}"
            }

    def is_tool_available(self, tool_name: str) -> bool:
        """
        Check if a tool is available.

        Args:
            tool_name: Name of the tool to check

        Returns:
            True if the tool is available, False otherwise
        """
        return tool_name in self.tools or tool_name in self.marketplace_tools

    def get_tool_capabilities(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """
        Get capabilities information for a tool.
        Uses caching to avoid regenerating schemas.

        Args:
            tool_name: Name of the tool

        Returns:
            Tool capabilities dictionary, or None if tool not found
        """
        from backend.src.core.cache import cache_manager
        
        tool = self.get_tool(tool_name)
        if tool:
            # Try cache first
            cache_key = cache_manager.get_tool_schema_key(tool_name)
            schema = cache_manager.tool_schemas.get(cache_key)
            
            if schema is None:
                # Cache miss - generate schema
                schema = tool.get_json_schema()
                cache_manager.tool_schemas.set(cache_key, schema)
            
            return {
                "name": tool.name,
                "description": tool.description,
                "parameters": schema.get("parameters", {}),
                "requires_context": True,
            }
        return None

    def get_registry_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the tool registry.

        Returns:
            Dictionary with registry statistics
        """
        all_tools_list = self.get_all_tools()
        domain_stats = self.categorizer.get_domain_statistics(all_tools_list)
        
        return {
            "total_tools": len(self.tools) + len(self.marketplace_instances),
            "builtin_tools": len(self.tools),
            "marketplace_tools_loaded": len(self.marketplace_instances),
            "marketplace_tools_available": len(self.marketplace_tools),
            "tool_names": self.get_tool_names(),
            "domain_statistics": {domain.value: count for domain, count in domain_stats.items()},
        }
    
    def get_tools_by_domain(self, domain: ToolDomain) -> List[SDKTool]:
        """
        Get all tools in a specific domain.
        
        Args:
            domain: Domain to filter by
            
        Returns:
            List of tools in the specified domain
        """
        all_tools = self.get_all_tools()
        return self.categorizer.get_tools_by_domain(all_tools, domain)
    
    def categorize_tool(self, tool: SDKTool) -> ToolDomain:
        """
        Categorize a tool by domain.
        
        Args:
            tool: Tool instance to categorize
            
        Returns:
            ToolDomain for the tool
        """
        return self.categorizer.categorize_tool(tool)


def create_tool_registry(
    config: Any,
    marketplace_dir: Optional[Path] = None,
    tool_search_engine: Optional[Any] = None,
) -> ToolRegistry:
    """
    Create and initialize a tool registry.
    (Wrapper for backward compatibility, though usage should be updated to Container)

    Args:
        config: Application configuration
        marketplace_dir: Optional path to marketplace directory
        tool_search_engine: Optional ToolSearchEngine instance

    Returns:
        Initialized tool registry
    """
    from backend.src.tools.loader import ToolLoader
    loader = ToolLoader(config)
    registry = ToolRegistry(config, tool_loader=loader)
    if tool_search_engine:
        registry.tool_search_engine = tool_search_engine
    return registry
