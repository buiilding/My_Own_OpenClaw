"""
Plugin Discovery System.

Provides mechanisms for discovering plugins from various sources.
"""
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
    """Discovers plugins from filesystem directories."""

    def __init__(self, plugin_dir: Path):
        self.plugin_dir = plugin_dir

    async def discover(self) -> List[Type[AgentPlugin]]:
        """Discover plugins from filesystem."""
        discovered: List[Type[AgentPlugin]] = []

        if not self.plugin_dir.exists():
            logger.warning(f"Plugin directory does not exist: {self.plugin_dir}")
            return discovered

        for py_file in self.plugin_dir.glob("*.py"):
            if py_file.name.startswith("__"):
                continue

            try:
                module_name = f"{self.plugin_dir.name}.{py_file.stem}"
                spec = importlib.util.spec_from_file_location(module_name, py_file)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    for name, obj in inspect.getmembers(module, inspect.isclass):
                        if (
                            name != "AgentPlugin"
                            and hasattr(obj, "name")
                            and inspect.isclass(obj)
                        ):
                            discovered.append(obj)
                            logger.debug(
                                f"Discovered plugin class: {name} in {py_file}"
                            )
            except Exception as e:
                logger.error(
                    f"Error discovering plugins in {py_file}: {e}", exc_info=True
                )

        return discovered

    def get_source_name(self) -> str:
        return "filesystem"
