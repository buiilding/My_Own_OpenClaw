"""Formatter for live web-search progress events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class WebSearchProgressEventFormatter(EventFormatter):
    """Formatter for provider-native web-search progress events."""
    message_type = OutgoingMessageType.WEB_SEARCH_PROGRESS

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        text = event.text
        if not isinstance(text, str) or not text.strip():
            self._log_missing_fields("WebSearchProgressEvent", ["text"], msg_id)
            return None

        payload = {
            "text": text,
            "request_id": event.request_id,
            "action_type": event.action_type,
            "query": event.query,
            "url": event.url,
            "pattern": event.pattern,
        }

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": payload,
        }
