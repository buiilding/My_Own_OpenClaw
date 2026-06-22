"""Formatter for tool output events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import (
    EventFormatter,
    EventInput,
    FormattedEvent,
)
from backend.src.api.schemas.common import DisplayAttachment


def _validated_display_attachments(event: EventInput) -> list[dict] | None:
    candidates = getattr(event, "display_attachments", None)
    if candidates is None:
        metadata = getattr(event, "metadata", None)
        if isinstance(metadata, dict):
            candidates = metadata.get("display_attachments")
    if not isinstance(candidates, list):
        return None

    attachments: list[dict] = []
    for candidate in candidates:
        try:
            attachment = DisplayAttachment.model_validate(candidate)
        except Exception:
            continue
        attachments.append(attachment.model_dump(exclude_none=True))
    return attachments or None


class ToolOutputEventFormatter(EventFormatter):
    """Formatter for tool output events."""

    message_type = OutgoingMessageType.TOOL_OUTPUT

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        tool_name = event.tool_name
        success = event.success

        if tool_name is None or success is None:
            # Missing required fields - log warning and skip formatting
            missing_fields = []
            if tool_name is None:
                missing_fields.append("tool_name")
            if success is None:
                missing_fields.append("success")

            self._log_missing_fields("ToolOutputEvent", missing_fields, msg_id)
            return None

        payload = {
            "tool_name": tool_name,
            "success": success,
            "execution_time": event.execution_time,
            "output": event.output,
            "error": event.error,
            "screenshot": event.screenshot,
            "screenshot_ref": getattr(event, "screenshot_ref", None),
            "screenshot_url": getattr(event, "screenshot_url", None),
            "screenshot_content_type": getattr(event, "screenshot_content_type", None),
            "metadata": event.metadata,
        }
        display_attachments = _validated_display_attachments(event)
        if display_attachments:
            payload["display_attachments"] = display_attachments

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": payload,
        }
