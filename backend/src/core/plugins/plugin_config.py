"""
Plugin Configuration.

This module contains the default plugin configuration.
Edit this file to change plugin enable/disable states, priorities, and custom configs.

Note: Changes require application restart to take effect.

Format:
{
    "plugin_name": {
        "enabled": bool,           # Whether plugin is enabled (default: True)
        "priority": int,           # Execution priority (lower = higher priority, default: 100)
        "config": {                # Custom plugin-specific configuration
            "key": "value"
        }
    }
}
"""
from typing import Any, Dict

# Default plugin configuration
# Edit the values below to customize plugin settings
PLUGIN_CONFIG: Dict[str, Dict[str, Any]] = {
    # Example plugin configuration:
    # "example_plugin": {
    #     "enabled": True,
    #     "priority": 100,
    #     "config": {
    #         "custom_setting": "value"
    #     }
    # }
}
