from backend.src.api.services.rehydrate_transparency_resolution import (
    extract_system_prompt_from_transparency,
    normalize_optional_string,
    normalize_transparency,
    resolve_rehydrated_content,
    resolve_transparency_content,
)


def test_normalize_transparency_returns_copy_for_dict_only():
    source = {"fullUserMessage": {"content": "hello"}}
    normalized = normalize_transparency(source)
    assert normalized == source
    assert normalized is not source
    assert normalize_transparency("bad") is None


def test_extract_system_prompt_from_transparency_handles_missing_and_trim():
    assert extract_system_prompt_from_transparency(None) is None
    assert extract_system_prompt_from_transparency({"systemPrompt": "  keep this  "}) == "keep this"


def test_resolve_transparency_content_returns_trimmed_string():
    assert resolve_transparency_content(
        transparency={"fullAssistantMessage": {"content": "  hi  "}},
        message_key="fullAssistantMessage",
    ) == "hi"
    assert resolve_transparency_content(
        transparency={"fullAssistantMessage": {"content": "   "}},
        message_key="fullAssistantMessage",
    ) is None


def test_resolve_rehydrated_content_prefers_transparency_for_user_and_assistant():
    user = resolve_rehydrated_content(
        role="user",
        normalized_message_type="user",
        raw_content="visible-user",
        transparency={"fullUserMessage": {"content": "full-user"}},
    )
    assistant = resolve_rehydrated_content(
        role="assistant",
        normalized_message_type="assistant",
        raw_content="visible-assistant",
        transparency={"fullAssistantMessage": {"content": "full-assistant"}},
    )
    tool = resolve_rehydrated_content(
        role="tool",
        normalized_message_type="tool-output",
        raw_content="tool-visible",
        transparency={"fullAssistantMessage": {"content": "ignored"}},
    )
    assert user == "full-user"
    assert assistant == "full-assistant"
    assert tool == "tool-visible"


def test_normalize_optional_string_trim_behavior():
    assert normalize_optional_string("  value ") == "value"
    assert normalize_optional_string(" ") is None
    assert normalize_optional_string(None) is None
