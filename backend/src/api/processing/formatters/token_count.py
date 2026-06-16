"""Formatter for token count events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class TokenCountEventFormatter(EventFormatter):
    """Formatter for token count events."""
    message_type = OutgoingMessageType.TOKEN_COUNT

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "prompt_tokens": event.prompt_tokens,
                "visible_output_tokens": event.visible_output_tokens,
                "thinking_tokens": event.thinking_tokens,
                "output_tokens_total": event.output_tokens_total,
                "total_tokens": event.total_tokens,
                "conversation_tokens": event.conversation_tokens,
                "usage_source": event.usage_source,
                "cached_tokens": event.cached_tokens,
                "cache_hit": event.cache_hit,
                "cache_status": event.cache_status,
            },
        }
