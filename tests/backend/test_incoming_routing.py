from backend.src.core.container.incoming_routing import (
    INCOMING_ROUTES,
    build_handler_bindings,
    get_incoming_message_types,
    validate_incoming_routes,
)


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

