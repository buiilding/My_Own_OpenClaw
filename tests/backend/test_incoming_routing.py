from typing import Annotated, Literal, Union

import pytest
from pydantic import BaseModel

import backend.src.core.container.incoming_routing as incoming_routing
from backend.src.core.container.incoming_routing import (
    INCOMING_ROUTES,
    IncomingRoute,
    build_handler_bindings,
    get_incoming_message_types,
    validate_incoming_routes,
)


def _make_handler_instances(*, drop_keys: tuple[str, ...] = ()) -> dict[str, object]:
    handlers = {
        "query_handler": object(),
        "stop_query_handler": object(),
        "rehydrate_conversation_handler": object(),
        "tool_result_handler": object(),
        "wakeword_handler": object(),
        "list_models_handler": object(),
        "load_settings_handler": object(),
        "update_settings_handler": object(),
    }
    for key in drop_keys:
        handlers.pop(key, None)
    return handlers


def test_incoming_routes_match_incoming_schema_types() -> None:
    route_types = {route.message_type for route in INCOMING_ROUTES}
    assert route_types == get_incoming_message_types()


def test_validate_incoming_routes_passes() -> None:
    validate_incoming_routes()


def test_build_handler_bindings_supports_shared_handler_keys() -> None:
    shared = object()
    bindings = build_handler_bindings(
        {
            "query_handler": object(),
            "stop_query_handler": object(),
            "rehydrate_conversation_handler": object(),
            "tool_result_handler": shared,
            "wakeword_handler": object(),
            "list_models_handler": object(),
            "load_settings_handler": object(),
            "update_settings_handler": object(),
        }
    )

    binding_map = dict(bindings)
    assert binding_map["tool-result"] is shared
    assert binding_map["tool-bundle-result"] is shared


def test_build_handler_bindings_preserves_route_order() -> None:
    bindings = build_handler_bindings(_make_handler_instances())

    assert [message_type for message_type, _ in bindings] == [
        route.message_type for route in INCOMING_ROUTES
    ]


def test_build_handler_bindings_raises_for_missing_handler_keys() -> None:
    with pytest.raises(ValueError, match="Missing handler instances"):
        build_handler_bindings(
            _make_handler_instances(drop_keys=("update_settings_handler",))
        )


def test_validate_incoming_routes_raises_on_duplicate_message_types(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        incoming_routing,
        "INCOMING_ROUTES",
        (
            IncomingRoute(message_type="query", handler_key="query_handler"),
            IncomingRoute(message_type="query", handler_key="query_handler_copy"),
        ),
    )

    with pytest.raises(ValueError, match="Duplicate incoming route"):
        validate_incoming_routes()


def test_validate_incoming_routes_raises_on_schema_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        incoming_routing,
        "INCOMING_ROUTES",
        (
            IncomingRoute(message_type="query", handler_key="query_handler"),
            IncomingRoute(message_type="custom-extra", handler_key="custom_handler"),
        ),
    )
    monkeypatch.setattr(
        incoming_routing,
        "get_incoming_message_types",
        lambda: {"query", "tool-result"},
    )

    with pytest.raises(
        ValueError,
        match=r"missing=\['tool-result'\], extra=\['custom-extra'\]",
    ):
        validate_incoming_routes()


def test_get_incoming_message_types_supports_non_annotated_union(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class QueryOnlyMessage(BaseModel):
        type: Literal["query"]

    class ToolOnlyMessage(BaseModel):
        type: Literal["tool-result"]

    monkeypatch.setattr(
        incoming_routing,
        "IncomingMessage",
        Union[QueryOnlyMessage, ToolOnlyMessage],
    )

    message_types = get_incoming_message_types()

    assert message_types == {"query", "tool-result"}


def test_get_incoming_message_types_raises_when_type_is_not_literal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class QueryOnlyMessage(BaseModel):
        type: Literal["query"]

    class InvalidMessage(BaseModel):
        type: str

    monkeypatch.setattr(
        incoming_routing,
        "IncomingMessage",
        Annotated[Union[QueryOnlyMessage, InvalidMessage], object()],
    )

    with pytest.raises(ValueError, match="non-literal type field"):
        get_incoming_message_types()
