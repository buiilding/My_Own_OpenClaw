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


def test_attach_context_fields_adds_only_truthy_values() -> None:
    base = {"type": "ok", "id": "m2", "payload": {}}

    result = attach_context_fields(
        base,
        {
            "session_id": "session_2",
            "user_id": "",
            "conversation_ref": None,
            "turn_ref": "turn_2",
        },
    )

    assert result is base
    assert result == {
        "type": "ok",
        "id": "m2",
        "payload": {},
        "session_id": "session_2",
        "turn_ref": "turn_2",
    }


def test_attach_context_fields_overwrites_existing_context_keys() -> None:
    base = {
        "type": "ok",
        "id": "m3",
        "payload": {},
        "session_id": "old_session",
        "conversation_ref": "old_conv",
    }

    result = attach_context_fields(
        base,
        {
            "session_id": "new_session",
            "conversation_ref": "new_conv",
        },
    )

    assert result["session_id"] == "new_session"
    assert result["conversation_ref"] == "new_conv"


def test_build_transport_message_without_context_fields() -> None:
    message = build_transport_message(
        "streaming-complete",
        "msg_9",
        {"final_response": "done"},
    )

    assert message == {
        "type": "streaming-complete",
        "id": "msg_9",
        "payload": {"final_response": "done"},
    }
