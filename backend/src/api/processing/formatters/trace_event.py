"""Formatter for sanitized runtime trace events."""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import (
    EventFormatter,
    EventInput,
    FormattedEvent,
)

_REDACTED_KEYS = {
    "accesstoken",
    "apikey",
    "authorization",
    "bearer",
    "bearertoken",
    "content",
    "credential",
    "credentials",
    "embedding",
    "embeddings",
    "filecontent",
    "memory",
    "memories",
    "messagetext",
    "oauthstate",
    "password",
    "providerpayload",
    "rawrows",
    "refreshtoken",
    "screenshot",
    "secret",
    "shelloutput",
    "sqlrow",
    "sqlrows",
    "stack",
    "text",
    "token",
    "usertext",
}

_TRACE_STATUSES = {"started", "succeeded", "failed", "skipped"}
_TRACE_RUNTIMES = {"sdk", "electron-main", "renderer", "sidecar", "backend", "provider"}
_MAX_ERROR_MESSAGE_LENGTH = 240


def _optional_string(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _finite_number(value: Any) -> Optional[float]:
    if not isinstance(value, (int, float)):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return value


def _sanitize_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    if not isinstance(value, dict):
        return str(value)
    sanitized: Dict[str, Any] = {}
    for key, entry in value.items():
        if not isinstance(key, str):
            continue
        normalized_key = "".join(ch for ch in key if ch.isalnum()).lower()
        if normalized_key in _REDACTED_KEYS or normalized_key.endswith("token"):
            sanitized[key] = "[redacted]"
        else:
            sanitized[key] = _sanitize_value(entry)
    return sanitized


def _sanitize_data(value: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(value, dict):
        return None
    return _sanitize_value(value)


def _sanitize_error(value: Any) -> Optional[Dict[str, str]]:
    if not isinstance(value, dict):
        return None
    code = _optional_string(value.get("code")) or "Error"
    message = _optional_string(value.get("message")) or "Unknown trace error"
    if len(message) > _MAX_ERROR_MESSAGE_LENGTH:
        message = f"{message[:_MAX_ERROR_MESSAGE_LENGTH]}..."
    return {"code": code, "message": message}


class TraceEventFormatter(EventFormatter):
    """Formatter for backend-origin durable trace events."""

    message_type = OutgoingMessageType.TRACE_EVENT

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        path = _optional_string(event.path)
        stage = _optional_string(event.stage)
        status = _optional_string(event.status)
        runtime = _optional_string(event.runtime)
        missing_fields = [
            name
            for name, value in (
                ("path", path),
                ("stage", stage),
                ("status", status),
                ("runtime", runtime),
            )
            if value is None
        ]
        if missing_fields:
            self._log_missing_fields("TraceEvent", missing_fields, msg_id)
            return None
        if status not in _TRACE_STATUSES or runtime not in _TRACE_RUNTIMES:
            self._log_missing_fields("TraceEvent", ["valid status/runtime"], msg_id)
            return None

        payload: Dict[str, Any] = {
            "schemaVersion": 1,
            "path": path,
            "stage": stage,
            "status": status,
            "runtime": runtime,
        }
        optional_string_fields = (
            ("traceId", event.trace_id),
            ("spanId", event.span_id),
            ("parentSpanId", event.parent_span_id),
            ("requestId", event.request_id),
            ("startedAt", event.started_at),
            ("endedAt", event.ended_at),
        )
        for key, raw_value in optional_string_fields:
            value = _optional_string(raw_value)
            if value is not None:
                payload[key] = value

        duration_ms = _finite_number(event.duration_ms)
        if duration_ms is not None:
            payload["durationMs"] = round(duration_ms)

        data = _sanitize_data(event.data)
        if data is not None:
            payload["data"] = data
        error = _sanitize_error(event.error)
        if error is not None:
            payload["error"] = error

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": payload,
        }
