from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.llm.messages import (
    ContentPartImageParam,
    ContentPartTextParam,
    ImageURL,
    SystemMessage,
    UserMessage,
)


def test_user_message_text_keeps_string_content():
    message = UserMessage(content="hello", role="user")
    assert message.text == "hello"


def test_user_message_text_joins_only_text_parts():
    message = UserMessage(
        role="user",
        content=[
            ContentPartTextParam(text="line1"),
            ContentPartImageParam(image_url=ImageURL(url="https://example.com/image.png")),
            ContentPartTextParam(text="line2"),
        ],
    )
    assert message.text == "line1\nline2"


def test_system_message_text_joins_text_parts():
    message = SystemMessage(
        role="system",
        content=[ContentPartTextParam(text="a"), ContentPartTextParam(text="b")],
    )
    assert message.text == "a\nb"
