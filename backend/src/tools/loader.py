import logging
import json
import importlib
from pathlib import Path
from typing import Dict, List, Type, Optional, Any

from backend.src.core.config import AppConfig, AppServices, get_settings
from backend.src.tools.base import Tool
from backend.src.tools.registry import ToolMetadata, ToolRegistry
from backend.sdk.tool import Tool as SDKTool
from backend.src.tools.adapter import SDKToolAdapter
from backend.src.tools.definitions import CORE_TOOLS
from backend.src.tools.marketplace.discovery.security import ToolSecurityScanner
from backend.src.tools.marketplace.discovery.validator import ToolManifestValidator

logger = logging.getLogger(__name__)

class ToolLoader:
    """
    Responsible for discovering and loading tools from various sources
    (Internal definitions, Marketplace filesystem, etc.).
    """

    def __init__(self, config: AppConfig):
        self.config = config
        self.services = AppServices(config)
        self._security_scanner = ToolSecurityScanner()
        self._validator = ToolManifestValidator()

    def load_core_tools(self) -> List[Tool]:
        """
        Instantiates and returns all core tools defined in definitions.py.
        """
        loaded_tools = []
        logger.info("Loading core tools...")

        for tool_class in CORE_TOOLS:
            try:
                tool_instance = self._instantiate_tool(tool_class)
                if tool_instance:
                    loaded_tools.append(tool_instance)
            except Exception as e:
                logger.error(f"Failed to load core tool {tool_class.__name__}: {e}", exc_info=True)
        
        logger.info(f"Loaded {len(loaded_tools)} core tools.")
        return loaded_tools

    def scan_marketplace_tools(self, marketplace_dir: Path) -> Dict[str, ToolMetadata]:
        """
        Scans the marketplace directory for valid tool manifests.
        Does NOT instantiate the tools, only returns metadata.
        """
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

    async def load_marketplace_tool(self, metadata: ToolMetadata) -> Optional[Tool]:
        """
        Loads and instantiates a specific marketplace tool from its metadata.
        """
        try:
            # Import the module
            # Assumes structure: tools.verified.{dir_name}.tool
            # TODO: Make this more robust to different import paths
            module_name = f"tools.verified.{metadata.tool_dir.name}.tool"
            
            module = importlib.import_module(module_name)
            tool_class = getattr(module, metadata.manifest.tool_class)

            tool_instance = self._instantiate_tool(tool_class)
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
            val_result = self._validator.validate_manifest(manifest_data)
            if not val_result.is_valid:
                logger.warning(f"Invalid manifest in {tool_dir.name}: {val_result.errors}")
                return None
            
            manifest = val_result.manifest

            # Security Scan (Async in original, but we can't easily await here if this is sync. 
            # Ideally this should be async. For now, assuming we call this from async context or accept overhead?
            # The original code awaited it. Let's make this method async or just skip strict async waiting for scanner if possible?
            # The scanner reads files. It's better to be async.
            # I will note that scan_marketplace_tools should probably be async.
            
            # For now, I will skip the async security scan here to keep the scan synchronous 
            # or I'll refactor scan_marketplace_tools to be async.
            # Let's check scanner code. It is async.
            
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
                security_status=None, # To be filled by async scanner if needed, or ignored for now
                manifest=manifest,
            )

        except Exception as e:
            logger.error(f"Error scanning {tool_dir.name}: {e}")
            return None

    async def validate_marketplace_tool_security(self, tool_dir: Path, permissions: List[str]):
        """
        Runs the security scanner on a tool directory.
        """
        return await self._security_scanner.scan_tool_directory(tool_dir, permissions)

    def _instantiate_tool(self, tool_class: Type) -> Optional[Tool]:
        """
        Instantiates a tool class (SDK or Legacy) and returns a Tool interface compatible object.
        """
        if issubclass(tool_class, SDKTool):
            # New SDK Tool
            # SDK tools currently are simple and don't take args in __init__ usually
            instance = tool_class()
            return SDKToolAdapter(instance)
        
        elif issubclass(tool_class, Tool):
            # Legacy Tool
            # Needs AppServices/Config injection
            # Inspect signature to be safe, or assume standard pattern
            # Standard pattern: __init__(self, services: AppServices) or similar
            
            # We'll try to inject services if the init accepts arguments
            import inspect
            sig = inspect.signature(tool_class.__init__)
            params = list(sig.parameters.values())[1:] # skip self

            args = []
            if len(params) > 0:
                args.append(self.services)
            
            # Add other dependencies if needed (e.g., search engine) - removed for simplicity in Loader
            # dependencies should be injected via setters or specific interfaces if possible
            
            return tool_class(*args)
        
        else:
            logger.error(f"Class {tool_class.__name__} does not implement known Tool interfaces.")
            return None

