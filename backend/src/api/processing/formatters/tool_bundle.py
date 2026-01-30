"""Formatter for tool bundle events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent, ToolBundleEvent


class ToolBundleEventFormatter(EventFormatter):
    """Formatter for tool bundle events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        if isinstance(event, dict):
            bundle_id = event.get("bundle_id", "")
            tools = event.get("tools", [])
        else:
            bundle_id = event.bundle_id
            tools = event.tools
        
        return {
            "type": "tool-bundle",
            "id": msg_id,
            "payload": {
                "bundle_id": bundle_id,
                "tools": tools,
            },
        }
