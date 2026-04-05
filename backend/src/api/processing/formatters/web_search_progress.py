"""Formatter for live web-search progress events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class WebSearchProgressEventFormatter(EventFormatter):
    """Formatter for provider-native web-search progress events."""

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        event_dict = self._get_event_dict(event)
        text = event_dict.get("text")
        if not isinstance(text, str) or not text.strip():
            self._log_missing_fields("WebSearchProgressEvent", ["text"], msg_id)
            return None

        payload = {
            "text": text,
            "request_id": event_dict.get("request_id"),
            "action_type": event_dict.get("action_type"),
            "query": event_dict.get("query"),
            "url": event_dict.get("url"),
            "pattern": event_dict.get("pattern"),
        }

        return {
            "type": OutgoingMessageType.WEB_SEARCH_PROGRESS,
            "id": msg_id,
            "payload": payload,
        }
