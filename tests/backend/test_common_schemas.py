import pytest
from pydantic import ValidationError

from backend.src.api.schemas.common import (
    BaseMessage,
    HandshakeMessage,
    MAX_MSG_ID_LENGTH,
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
    ok = HandshakeMessage(type="handshake", user_id=" user-2 ")
    assert ok.user_id == "user-2"

    with pytest.raises(ValidationError):
        HandshakeMessage(type="handshake", user_id="default_user")
