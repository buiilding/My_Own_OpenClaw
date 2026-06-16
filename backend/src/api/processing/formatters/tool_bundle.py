"""Formatter for tool bundle events."""
from typing import Any

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ToolBundleEventFormatter(EventFormatter):
    """Formatter for tool bundle events."""
    message_type = OutgoingMessageType.TOOL_BUNDLE

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        event_dict = self._get_event_dict(event)
        bundle_id = event_dict.get("bundle_id")
        tools = event_dict.get("tools")

        missing_fields = []
        if not bundle_id:
            missing_fields.append("bundle_id")
        if not isinstance(tools, list):
            missing_fields.append("tools(type)")
        elif not all(_is_tool_bundle_item(tool) for tool in tools):
            missing_fields.append("tools(item)")

        if missing_fields:
            self._log_missing_fields("ToolBundleEvent", missing_fields, msg_id)
            return None
        
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "bundle_id": bundle_id,
                "tools": tools,
            },
        }


def _is_tool_bundle_item(tool: Any) -> bool:
    if not isinstance(tool, dict):
        return False
    return bool(tool.get("name")) and isinstance(tool.get("args"), dict)
