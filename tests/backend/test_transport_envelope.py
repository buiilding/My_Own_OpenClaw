from backend.src.api.transport.envelope import (
    attach_context_fields,
    build_transport_message,
)


def test_build_transport_message_includes_context_fields() -> None:
    message = build_transport_message(
        "settings-updated",
        "msg_1",
        {"updated_keys": ["model_provider"]},
        context={
            "session_id": "session_1",
            "user_id": "user_1",
            "conversation_ref": "conv_1",
            "turn_ref": "turn_1",
        },
    )

    assert message == {
        "type": "settings-updated",
        "id": "msg_1",
        "payload": {"updated_keys": ["model_provider"]},
        "session_id": "session_1",
        "user_id": "user_1",
        "conversation_ref": "conv_1",
        "turn_ref": "turn_1",
    }


def test_attach_context_fields_no_context_is_noop() -> None:
    base = {"type": "ok", "id": "m1", "payload": {}}
    result = attach_context_fields(base, None)

    assert result is base
    assert result == {"type": "ok", "id": "m1", "payload": {}}
