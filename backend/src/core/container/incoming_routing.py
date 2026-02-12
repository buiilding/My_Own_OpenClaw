"""
Core-owned incoming message routing specification.

Defines the canonical mapping between incoming WebSocket message types and
handler keys used by the API container wiring.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal, Mapping, get_args, get_origin

from backend.src.api.schema import IncomingMessage


@dataclass(frozen=True)
class IncomingRoute:
    """One incoming message route binding."""

    message_type: str
    handler_key: str


INCOMING_ROUTES: tuple[IncomingRoute, ...] = (
    IncomingRoute(message_type="query", handler_key="query_handler"),
    IncomingRoute(
        message_type="rehydrate-conversation",
        handler_key="rehydrate_conversation_handler",
    ),
    IncomingRoute(message_type="tool-result", handler_key="tool_result_handler"),
    IncomingRoute(message_type="tool-bundle-result", handler_key="tool_result_handler"),
    IncomingRoute(message_type="wakeword-detected", handler_key="wakeword_handler"),
    IncomingRoute(message_type="list-models", handler_key="list_models_handler"),
    IncomingRoute(message_type="load-settings", handler_key="load_settings_handler"),
    IncomingRoute(message_type="update-settings", handler_key="update_settings_handler"),
)


def get_incoming_message_types() -> set[str]:
    """
    Return all valid incoming message types from discriminated IncomingMessage schema.
    """
    annotated = IncomingMessage
    union_type = get_args(annotated)[0] if get_origin(annotated) is Annotated else annotated

    message_types: set[str] = set()
    for model in get_args(union_type):
        field = model.model_fields["type"]
        annotation = field.annotation
        if get_origin(annotation) is not Literal:
            raise ValueError(
                f"Incoming message model {model.__name__} has non-literal type field: {annotation!r}"
            )
        literals = get_args(annotation)
        message_types.update(str(value) for value in literals)

    return message_types


def validate_incoming_routes() -> None:
    """
    Validate route table has no duplicates and matches incoming schema message types.
    """
    route_types = [route.message_type for route in INCOMING_ROUTES]
    route_type_set = set(route_types)
    if len(route_types) != len(route_type_set):
        duplicates = sorted(
            message_type
            for message_type in route_type_set
            if route_types.count(message_type) > 1
        )
        raise ValueError(
            f"Duplicate incoming route message types in INCOMING_ROUTES: {duplicates}"
        )

    schema_types = get_incoming_message_types()
    missing = sorted(schema_types - route_type_set)
    extra = sorted(route_type_set - schema_types)
    if missing or extra:
        raise ValueError(
            "Incoming route table does not match incoming schema types. "
            f"missing={missing}, extra={extra}"
        )


def build_handler_bindings(
    handlers_by_key: Mapping[str, Any],
) -> tuple[tuple[str, Any], ...]:
    """
    Build concrete `(message_type, handler_instance)` bindings from route table.
    """
    validate_incoming_routes()

    missing_handler_keys = sorted(
        {route.handler_key for route in INCOMING_ROUTES} - set(handlers_by_key.keys())
    )
    if missing_handler_keys:
        raise ValueError(
            f"Missing handler instances for route keys: {missing_handler_keys}"
        )

    return tuple(
        (route.message_type, handlers_by_key[route.handler_key])
        for route in INCOMING_ROUTES
    )
