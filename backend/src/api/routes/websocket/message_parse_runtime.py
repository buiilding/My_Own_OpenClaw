"""Runtime helpers for websocket message parse/validation."""

from __future__ import annotations

import asyncio
import json
import logging

from pydantic import ValidationError as PydanticValidationError, TypeAdapter

from backend.src.api.routes.websocket.json_parse import (
    JsonRootTypeError,
    parse_json_object_payload,
)
from backend.src.api.schema import IncomingMessage

# Create TypeAdapter once at module level for performance.
_INCOMING_MESSAGE_ADAPTER = TypeAdapter(IncomingMessage)


def format_validation_errors(error: PydanticValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
        for err in error.errors()
    )


async def parse_and_validate_message_runtime(
    *,
    data: str,
    user_id: str,
    max_message_size: int,
    json_parse_offload_bytes: int,
    parse_json_object_payload_fn=parse_json_object_payload,
    loop_getter=asyncio.get_running_loop,
    logger: logging.Logger,
) -> tuple[IncomingMessage | None, str | None]:
    """Parse and validate incoming websocket message payload."""
    data_size = len(data.encode("utf-8"))
    if data_size > max_message_size:
        return None, (
            f"Message too large: {data_size} bytes (max: {max_message_size} bytes)"
        )

    try:
        json_data = await parse_json_object_payload_fn(
            data,
            offload_threshold_bytes=json_parse_offload_bytes,
            loop_getter=loop_getter,
        )
        # BaseMessage requires user_id, but it comes from connection context.
        json_data["user_id"] = user_id

        try:
            validated_msg = _INCOMING_MESSAGE_ADAPTER.validate_python(json_data)
            return validated_msg, None
        except PydanticValidationError as error:
            return None, f"Invalid message format: {format_validation_errors(error)}"

    except JsonRootTypeError as error:
        return None, (
            f"Invalid message format: root must be an object, got {error.payload_type}"
        )
    except json.JSONDecodeError:
        return None, "Malformed JSON"
    except Exception as error:
        logger.error("Unexpected error parsing message: %s", error, exc_info=True)
        return None, "An internal error occurred"
