import pytest
from pydantic import ValidationError

from backend.src.api.schemas.common import (
    MAX_MSG_ID_LENGTH,
    BaseMessage,
    HandshakeMessage,
)


def test_base_message_accepts_valid_payload_and_trims_id():
    message = BaseMessage(
        id="  msg_123  ",
        type="query",
        payload={"x": 1},
        user_id="user-1",
    )

    assert message.id == "msg_123"
    assert message.payload == {"x": 1}


@pytest.mark.parametrize(
    "invalid_id",
    [
        "",
        "   ",
        "msg with spaces",
        "msg$bad",
        "a" * (MAX_MSG_ID_LENGTH + 1),
    ],
)
def test_base_message_rejects_invalid_message_ids(invalid_id):
    with pytest.raises(ValidationError):
        BaseMessage(
            id=invalid_id,
            type="query",
            payload={},
            user_id="user-1",
        )


def test_base_message_rejects_default_user_id():
    with pytest.raises(ValidationError):
        BaseMessage(
            id="msg-1",
            type="query",
            payload={},
            user_id="default_user",
        )


def test_handshake_message_validates_user_id():
    ok = HandshakeMessage(
        type="handshake",
        user_id=" user-2 ",
        operating_system=" macOS ",
        available_tools=[" read_file ", "read_file", "mouse_control"],
        available_coordinate_methods=["manual", "ocr"],
        requested_agent_policy={
            "profile": "coding",
            "disabled_tools": [" browser "],
            "coordinate_methods": ["manual"],
            "disabled_capabilities": ["vision"],
        },
    )
    assert ok.user_id == "user-2"
    assert ok.operating_system == "macOS"
    assert ok.available_tools == ["read_file", "mouse_control"]
    assert ok.to_session_config_overrides() == {
        "agent_available_tools": ["read_file", "mouse_control"],
        "agent_available_coordinate_methods": ["manual", "ocr"],
        "agent_tool_profile": "coding",
        "agent_disabled_tools": ["browser"],
        "agent_coordinate_methods": ["manual"],
        "agent_disabled_capabilities": ["vision"],
    }

    with pytest.raises(ValidationError):
        HandshakeMessage(type="handshake", user_id="default_user")

    with pytest.raises(ValidationError):
        HandshakeMessage(
            type="handshake",
            user_id="user-2",
            available_tools=["  "],
        )
