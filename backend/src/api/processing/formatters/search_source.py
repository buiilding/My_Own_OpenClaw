"""Formatter for search source discovery events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class SearchSourceEventFormatter(EventFormatter):
    """Formatter for lightweight search-source trace events."""

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        event_dict = self._get_event_dict(event)
        url = event_dict.get("url")
        provider = event_dict.get("provider")
        if not isinstance(url, str) or not url.strip():
            self._log_missing_fields("SearchSourceEvent", ["url"], msg_id)
            return None
        if not isinstance(provider, str) or not provider.strip():
            self._log_missing_fields("SearchSourceEvent", ["provider"], msg_id)
            return None

        payload = {
            "url": url.strip(),
            "provider": provider.strip(),
        }
        if isinstance(event_dict.get("title"), str) and event_dict["title"].strip():
            payload["title"] = event_dict["title"].strip()
        if isinstance(event_dict.get("query"), str) and event_dict["query"].strip():
            payload["query"] = event_dict["query"].strip()
        if isinstance(event_dict.get("rank"), int):
            payload["rank"] = event_dict["rank"]

        return {
            "type": OutgoingMessageType.SEARCH_SOURCE,
            "id": msg_id,
            "payload": payload,
        }

