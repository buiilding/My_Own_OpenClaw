"""
Plugin Metadata Definitions.

Defines data structures for plugin configuration and metadata.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class PluginConfig:
    """Configuration for a plugin."""

    enabled: bool = True
    priority: int = 100
    config: Dict[str, Any] = field(default_factory=dict)
    dependencies: List[str] = field(default_factory=list)


@dataclass
class PluginMetadata:
    """Metadata about a plugin."""

    name: str
    version: str = "1.0.0"
    author: str = "Unknown"
    description: str = ""
    source: str = "manual"  # "entry_point", "filesystem", "manual"
    config: PluginConfig = field(default_factory=PluginConfig)
    dependencies: List[str] = field(default_factory=list)
    module_path: Optional[str] = None
