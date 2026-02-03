from backend.src.core.messages.converters import content_to_message_content
from backend.src.core.messages.structures import ImageContent, StoredMessage, TextContent
from backend.src.core.types.enums import MessageRole, MessageType


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
        image_data="abc123",
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
        image_data="data:image/png;base64,xyz",
    )
    llm_message = message.to_llm_message()
    content = llm_message["content"]
    assert content[1]["image_url"]["url"] == "data:image/png;base64,xyz"


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
