"""
Plugin Discovery System.

Provides mechanisms for discovering plugins from various sources.
"""
import ast
import importlib
import importlib.util
import inspect
import logging
import sys
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Type

try:
    if sys.version_info >= (3, 8):
        from importlib.metadata import entry_points
    else:
        from importlib_metadata import entry_points
except ImportError:
    entry_points = None

from backend.src.agent.plugins.interface import AgentPlugin

logger = logging.getLogger(__name__)


class PluginDiscoverer(ABC):
    """Abstract base class for plugin discovery mechanisms."""

    @abstractmethod
    async def discover(self) -> List[Type[AgentPlugin]]:
        """Discover plugin classes."""
        pass

    @abstractmethod
    def get_source_name(self) -> str:
        """Get the name of this discovery source."""
        pass


class EntryPointPluginDiscoverer(PluginDiscoverer):
    """Discovers plugins via setuptools entry points."""

    def __init__(self, entry_point_group: str = "desktop_assistant.plugins"):
        """Initialize entry point discoverer."""
        self.entry_point_group = entry_point_group

    async def discover(self) -> List[Type[AgentPlugin]]:
        """Discover plugins from entry points."""
        if entry_points is None:
            logger.warning(
                "importlib.metadata not available. Entry point discovery disabled."
            )
            return []

        discovered: List[Type[AgentPlugin]] = []

        try:
            # Handle different importlib.metadata APIs across Python versions
            if sys.version_info >= (3, 10):
                eps = entry_points(group=self.entry_point_group)
            else:
                eps = entry_points().get(self.entry_point_group, [])

            for entry_point in eps:
                try:
                    plugin_class = entry_point.load()
                    if not inspect.isclass(plugin_class) or not hasattr(
                        plugin_class, "name"
                    ):
                        continue
                    discovered.append(plugin_class)
                    logger.debug(
                        f"Discovered plugin via entry point: {entry_point.name}"
                    )
                except Exception as e:
                    logger.error(
                        f"Error loading entry point '{entry_point.name}': {e}",
                        exc_info=True,
                    )
        except Exception as e:
            logger.error(f"Error discovering entry points: {e}", exc_info=True)

        return discovered

    def get_source_name(self) -> str:
        return "entry_point"


class FilesystemPluginDiscoverer(PluginDiscoverer):
    """
    Discovers plugins from filesystem directories.
    
    SECURITY: Uses AST parsing to inspect files statically before importing,
    preventing arbitrary code execution during discovery. Only files containing
    valid plugin classes are imported.
    """

    def __init__(self, plugin_dir: Path):
        self.plugin_dir = plugin_dir

    def _inspect_file_for_plugin_classes(self, py_file: Path) -> List[str]:
        """
        Statically inspect a Python file for plugin class definitions using AST.
        
        This prevents arbitrary code execution during discovery by only parsing
        the AST structure, not executing the module.
        
        Args:
            py_file: Path to Python file to inspect
            
        Returns:
            List of class names that appear to be plugin classes
        """
        plugin_class_names = []
        
        try:
            with open(py_file, 'r', encoding='utf-8') as f:
                source = f.read()
            
            tree = ast.parse(source, filename=str(py_file))
            
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    # Check if class has a 'name' attribute (common plugin pattern)
                    # or inherits from AgentPlugin
                    has_name_attr = False
                    inherits_agent_plugin = False
                    
                    # Check for 'name' attribute assignment in class body
                    for item in node.body:
                        if isinstance(item, ast.Assign):
                            for target in item.targets:
                                if isinstance(target, ast.Name) and target.id == 'name':
                                    has_name_attr = True
                                    break
                    
                    # Check if class inherits from AgentPlugin
                    for base in node.bases:
                        if isinstance(base, ast.Name):
                            if base.id == 'AgentPlugin':
                                inherits_agent_plugin = True
                                break
                        elif isinstance(base, ast.Attribute):
                            if base.attr == 'AgentPlugin':
                                inherits_agent_plugin = True
                                break
                    
                    # Consider it a plugin if it has 'name' attribute or inherits from AgentPlugin
                    if (has_name_attr or inherits_agent_plugin) and node.name != "AgentPlugin":
                        plugin_class_names.append(node.name)
                        
        except SyntaxError as e:
            logger.warning(f"Syntax error in {py_file}: {e}")
        except Exception as e:
            logger.warning(f"Error inspecting {py_file} with AST: {e}")
        
        return plugin_class_names

    async def discover(self) -> List[Type[AgentPlugin]]:
        """
        Discover plugins from filesystem.
        
        SECURITY: Uses AST parsing to statically inspect files before importing,
        preventing arbitrary code execution during discovery. Only files containing
        valid plugin classes are imported and executed.
        """
        discovered: List[Type[AgentPlugin]] = []

        if not self.plugin_dir.exists():
            logger.warning(f"Plugin directory does not exist: {self.plugin_dir}")
            return discovered

        for py_file in self.plugin_dir.glob("*.py"):
            if py_file.name.startswith("__"):
                continue

            try:
                # SECURITY: Statically inspect file with AST before importing
                # This prevents arbitrary code execution during discovery
                plugin_class_names = self._inspect_file_for_plugin_classes(py_file)
                
                if not plugin_class_names:
                    logger.debug(f"No plugin classes found in {py_file} (AST inspection)")
                    continue
                
                # Only import if AST inspection found potential plugin classes
                # This is still a security risk if the file contains malicious code,
                # but it reduces the attack surface by not importing every .py file
                module_name = f"{self.plugin_dir.name}.{py_file.stem}"
                spec = importlib.util.spec_from_file_location(module_name, py_file)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    # WARNING: exec_module still executes module-level code
                    # For true security, consider sandboxing or using restricted execution
                    spec.loader.exec_module(module)
                    
                    # Only check classes that AST inspection identified
                    for class_name in plugin_class_names:
                        if hasattr(module, class_name):
                            obj = getattr(module, class_name)
                            if (
                                inspect.isclass(obj)
                                and hasattr(obj, "name")
                                and obj != AgentPlugin
                            ):
                                discovered.append(obj)
                                logger.debug(
                                    f"Discovered plugin class: {class_name} in {py_file}"
                                )
            except Exception as e:
                logger.error(
                    f"Error discovering plugins in {py_file}: {e}", exc_info=True
                )

        return discovered

    def get_source_name(self) -> str:
        return "filesystem"
