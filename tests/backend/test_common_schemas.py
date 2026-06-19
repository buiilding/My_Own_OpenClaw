"""Covers common schemas behavior in the backend test suite."""

import pytest
from pydantic import ValidationError

from backend.src.api.schemas.common import (
    MAX_MSG_ID_LENGTH,
    BaseMessage,
    HandshakeMessage,
)
from backend.src.api.schemas.agent_definition import AgentDefinition


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
        agent_definition={
            "runtime": {
                "operating_system": " macOS ",
                "coordinate_methods": ["manual"],
            },
            "tools": {
                "mode": "explicit",
                "available_tools": [" read_file ", "read_file", "mouse_control"],
                "disabled_tools": [" browser "],
                "disabled_capabilities": ["vision"],
            },
        },
    )
    assert ok.user_id == "user-2"
    assert ok.agent_definition.runtime.operating_system == "macOS"
    assert ok.agent_definition.tools.available_tools == ["read_file", "mouse_control"]
    assert ok.agent_definition.to_session_config_overrides() == {
        "agent_available_tools": ["read_file", "mouse_control"],
        "agent_available_coordinate_methods": ["manual"],
        "agent_disabled_tools": ["browser"],
        "agent_disabled_capabilities": ["vision"],
    }

    with pytest.raises(ValidationError):
        HandshakeMessage(type="handshake", user_id="default_user")


def test_handshake_rejects_top_level_client_tool_manifest():
    with pytest.raises(ValidationError):
        HandshakeMessage(
            type="handshake",
            user_id="user-2",
            client_tool_manifest={"tools": []},
        )


@pytest.mark.parametrize(
    "removed_field",
    [
        {"operating_system": "macOS"},
        {"available_tools": ["read_file"]},
        {"available_coordinate_methods": ["manual"]},
        {"requested_agent_policy": {"disabled_tools": ["browser"]}},
    ],
)
def test_handshake_rejects_removed_top_level_capability_fields(removed_field):
    with pytest.raises(ValidationError):
        HandshakeMessage(
            type="handshake",
            user_id="user-2",
            **removed_field,
        )


def test_handshake_coordinate_method_overrides_use_consistent_key():
    definition = AgentDefinition(
        id="custom-agent",
        runtime={"coordinate_methods": ["manual"]},
    )

    assert definition.to_session_config_overrides() == {
        "agent_available_coordinate_methods": ["manual"],
    }


def test_agent_definition_rejects_removed_legacy_default_mode():
    with pytest.raises(ValidationError):
        AgentDefinition(mode="windie_default")


def test_agent_definition_docstring_uses_hosted_default_policy_wording():
    doc = " ".join((AgentDefinition.__doc__ or "").split())

    assert "hosted backend's default agent policy" in doc
    assert "default WindieOS agent" not in doc


def test_agent_definition_normalizes_prompt_tools_and_runtime():
    definition = AgentDefinition(
        id=" custom-agent ",
        system_prompt={"mode": "replace", "content": "  You are a custom agent. "},
        tools={
            "mode": "client_only",
            "client_manifest": {
                "version": 1,
                "tools": [
                    {
                        "name": "save_note",
                        "description": "Save a note.",
                        "schema": {
                            "type": "object",
                            "properties": {"note": {"type": "string"}},
                            "required": ["note"],
                            "additionalProperties": False,
                        },
                    }
                ],
            },
            "enabled_remote_tools": [" web_search ", "web_search"],
            "disabled_tools": [" browser "],
        },
        skills=[
            {
                "id": "review",
                "type": "skill",
                "priority": 70,
                "content": "  Review carefully. ",
            }
        ],
        agents_md=[
            {
                "id": "repo",
                "type": "agents_md",
                "priority": 50,
                "content": "Follow repo rules.",
            }
        ],
        runtime={"operating_system": " macOS ", "coordinate_methods": ["manual"]},
    )

    assert definition.id == "custom-agent"
    assert definition.system_prompt_override() == "You are a custom agent."
    assert definition.client_tool_manifest()["tools"][0]["name"] == "save_note"
    assert definition.tools.enabled_remote_tools == ["web_search"]
    assert definition.client_prompt_layers() == [
        {
            "id": "repo",
            "type": "agents_md",
            "priority": 50,
            "content": "Follow repo rules.",
        },
        {
            "id": "review",
            "type": "skill",
            "priority": 70,
            "content": "Review carefully.",
        },
    ]
    assert definition.to_session_config_overrides(
        accepted_client_tool_names=["save_note"]
    ) == {
        "agent_available_tools": ["save_note", "web_search"],
        "agent_disabled_tools": ["browser"],
        "agent_available_coordinate_methods": ["manual"],
    }


def test_handshake_accepts_first_class_agent_definition():
    message = HandshakeMessage(
        type="handshake",
        user_id="user-2",
        agent_definition={
            "version": 1,
            "system_prompt": {
                "mode": "replace",
                "content": "Custom system prompt.",
            },
            "runtime": {"operating_system": "Linux"},
        },
    )

    assert message.agent_definition.system_prompt_override() == "Custom system prompt."
    assert message.agent_definition.runtime.operating_system == "Linux"
