"""
Response Formatter for Query Handler.

Formats agent events into WebSocket response messages.
"""
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class ResponseFormatter:
    """
    Formats agent events into WebSocket response messages.
    """

    def format(self, event: Dict[str, Any], msg_id: str) -> Optional[Dict[str, Any]]:
        """
        Format agent event into WebSocket response.

        Args:
            event: Event dictionary from agent
            msg_id: Message ID for response

        Returns:
            Formatted response dictionary or None if event type not recognized
        """
        event_type = event.get("type")

        if event_type == "thinking":
            return {
                "type": "llm-thought",
                "id": msg_id,
                "payload": {"status": event["content"]},
            }
        elif event_type == "chunk":
            return {
                "type": "streaming-response",
                "id": msg_id,
                "payload": {"text": event["content"]},
            }
        elif event_type == "error":
            return {
                "type": "error",
                "id": msg_id,
                "payload": {"content": event.get("content", "Error")},
            }
        elif event_type == "streaming-complete":
            return {"type": "streaming-complete", "id": msg_id, "payload": {}}
        elif event_type == "tool_call":
            return {
                "type": "tool-call",
                "id": msg_id,
                "payload": {
                    "tool_name": event.get("tool_name"),
                    "parameters": event.get("parameters"),
                    "raw_call": event.get("raw_call"),
                },
            }
        elif event_type == "tool_output":
            return {
                "type": "tool-output",
                "id": msg_id,
                "payload": {
                    "tool_name": event.get("tool_name"),
                    "success": event.get("success"),
                    "execution_time": event.get("execution_time"),
                    "output": event.get("output"),
                    "error": event.get("error"),
                    "screenshot": event.get("screenshot"),
                },
            }

        return None
