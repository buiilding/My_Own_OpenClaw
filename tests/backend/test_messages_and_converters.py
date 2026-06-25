"""Covers messages and converters behavior in the backend test suite."""

import base64

from backend.src.core.messages.converters import content_to_message_content
from backend.src.core.messages.structures import (
    ImageContent,
    StoredMessage,
    TextContent,
)
from backend.src.core.types.enums import MessageRole, MessageType

JPEG_BASE64 = base64.b64encode(b"\xff\xd8\xff\xe0jpeg-bytes").decode("ascii")
PNG_BASE64 = base64.b64encode(b"\x89PNG\r\n\x1a\npng-bytes").decode("ascii")


def test_stored_message_text_only():
    message = StoredMessage(
        role=MessageRole.USER,
        content="hello",
        message_type=MessageType.USER_QUERY,
    )
    llm_message = message.to_llm_message()
    assert llm_message["role"] == "user"
    assert llm_message["content"] == "hello"


def test_stored_message_image_adds_prefix():
    message = StoredMessage(
        role=MessageRole.ASSISTANT,
        content="see this",
        message_type=MessageType.ASSISTANT_RESPONSE,
        image_data=PNG_BASE64,
    )
    llm_message = message.to_llm_message()
    content = llm_message["content"]
    assert isinstance(content, list)
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_stored_message_image_preserves_existing_prefix():
    message = StoredMessage(
        role=MessageRole.ASSISTANT,
        content="already encoded",
        message_type=MessageType.ASSISTANT_RESPONSE,
        image_data=f"data:image/png;base64,{PNG_BASE64}",
    )
    llm_message = message.to_llm_message()
    content = llm_message["content"]
    assert content[1]["image_url"]["url"] == f"data:image/png;base64,{PNG_BASE64}"


def test_stored_message_image_repairs_mismatched_existing_prefix():
    message = StoredMessage(
        role=MessageRole.TOOL,
        content="screenshot",
        message_type=MessageType.TOOL_OUTPUT,
        image_data=f"data:image/png;base64,{JPEG_BASE64}",
        tool_call_id="call_1",
    )

    llm_message = message.to_llm_message()
    content = llm_message["content"]
    assert content[1]["image_url"]["url"] == f"data:image/jpeg;base64,{JPEG_BASE64}"


def test_stored_message_supports_multiple_images():
    message = StoredMessage(
        role=MessageRole.USER,
        content="compare",
        message_type=MessageType.USER_QUERY,
        image_data=[PNG_BASE64, f"data:image/png;base64,{PNG_BASE64}"],
    )

    llm_message = message.to_llm_message()
    content = llm_message["content"]
    assert isinstance(content, list)
    assert content[0] == {"type": "text", "text": "compare"}
    assert content[1]["image_url"]["url"] == f"data:image/png;base64,{PNG_BASE64}"
    assert content[2]["image_url"]["url"] == f"data:image/png;base64,{PNG_BASE64}"


def test_content_to_message_content_text_only():
    converted = content_to_message_content("hello")
    assert isinstance(converted, TextContent)
    assert converted.get_text() == "hello"


def test_content_to_message_content_with_image():
    content = [
        {"type": "text", "text": "hello"},
        {"type": "text", "text": "world"},
        {"type": "image_url", "image_url": {"url": "http://example.com/image.png"}},
    ]
    converted = content_to_message_content(content)
    assert isinstance(converted, ImageContent)
    assert converted.get_text() == "hello world"
    assert converted.get_image_urls() == ["http://example.com/image.png"]


def test_content_to_message_content_without_image():
    content = [{"type": "text", "text": "only text"}]
    converted = content_to_message_content(content)
    assert isinstance(converted, TextContent)
    assert converted.get_text() == "only text"


def test_content_to_message_content_supports_openai_responses_text_blocks():
    content = [
        {"type": "output_text", "text": "visible"},
        {"type": "refusal", "refusal": "cannot comply"},
        {"type": "input_text", "text": "ignored no longer special"},
    ]

    converted = content_to_message_content(content)

    assert isinstance(converted, TextContent)
    assert converted.get_text() == "visible cannot comply ignored no longer special"


def test_stored_message_assistant_tool_calls_normalized_and_named():
    message = StoredMessage(
        role=MessageRole.ASSISTANT,
        content="calling tools",
        message_type=MessageType.ASSISTANT_RESPONSE,
        tool_name="assistant_tool",
        tool_calls=[
            {"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a"}},
            {"name": "", "arguments": "bad-args"},
            "invalid-entry",
        ],
    )

    llm_message = message.to_llm_message()

    assert llm_message["role"] == "assistant"
    assert llm_message["name"] == "assistant_tool"
    assert llm_message["content"] == "calling tools"
    assert llm_message["tool_calls"] == [
        {"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a"}},
        {"id": "tool_call_1", "name": "unknown_tool", "arguments": {}},
    ]


def test_stored_message_prefers_structured_content_for_assistant_llm_message():
    message = StoredMessage(
        role=MessageRole.ASSISTANT,
        content="Visible answer.Cannot share that.",
        message_type=MessageType.ASSISTANT_RESPONSE,
        structured_content=[
            {"type": "output_text", "text": "Visible answer."},
            {"type": "refusal", "refusal": "Cannot share that."},
        ],
    )

    llm_message = message.to_llm_message()

    assert llm_message == {
        "role": "assistant",
        "content": [
            {"type": "output_text", "text": "Visible answer."},
            {"type": "refusal", "refusal": "Cannot share that."},
        ],
    }


def test_stored_message_tool_role_defaults_and_name_passthrough():
    message = StoredMessage(
        role=MessageRole.TOOL,
        content="tool output",
        message_type=MessageType.TOOL_OUTPUT,
        tool_name="read_file",
        tool_call_id=None,
    )

    llm_message = message.to_llm_message()

    assert llm_message == {
        "role": "tool",
        "content": "tool output",
        "tool_call_id": "unknown_tool_call",
        "name": "read_file",
    }


def test_stored_message_tool_role_supports_multimodal_content_with_image():
    message = StoredMessage(
        role=MessageRole.TOOL,
        content="tool output with screenshot",
        message_type=MessageType.TOOL_OUTPUT,
        tool_call_id="call_1",
        image_data=PNG_BASE64,
    )

    llm_message = message.to_llm_message()

    assert llm_message["role"] == "tool"
    assert llm_message["tool_call_id"] == "call_1"
    assert isinstance(llm_message["content"], list)
    assert llm_message["content"][0]["type"] == "text"
    assert llm_message["content"][0]["text"] == "tool output with screenshot"
    assert llm_message["content"][1]["type"] == "image_url"
    assert llm_message["content"][1]["image_url"]["url"].startswith(
        "data:image/png;base64,"
    )


def test_content_to_message_content_preserves_all_images_and_ignores_invalid_parts():
    content = [
        {"type": "text", "text": "first"},
        {"type": "image_url", "image_url": {"url": "http://example.com/one.png"}},
        {"type": "image_url", "image_url": {"url": "http://example.com/two.png"}},
        {"type": "text", "text": "second"},
        {"type": "image_url", "image_url": "invalid"},
        123,
    ]

    converted = content_to_message_content(content)

    assert isinstance(converted, ImageContent)
    assert converted.get_text() == "first second"
    assert converted.get_image_urls() == [
        "http://example.com/one.png",
        "http://example.com/two.png",
    ]
    assert converted.to_llm_format() == [
        {"type": "text", "text": "first second"},
        {
            "type": "image_url",
            "image_url": {"url": "http://example.com/one.png"},
        },
        {
            "type": "image_url",
            "image_url": {"url": "http://example.com/two.png"},
        },
    ]


def test_content_to_message_content_non_list_non_str_falls_back_to_string():
    class DummyContent:
        def __str__(self):
            return "dummy-content"

    converted = content_to_message_content(DummyContent())

    assert isinstance(converted, TextContent)
    assert converted.get_text() == "dummy-content"
