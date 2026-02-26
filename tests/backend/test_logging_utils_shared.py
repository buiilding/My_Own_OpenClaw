from backend.src.agent.tools.shared import short_id


def test_short_id_truncates_to_default_length():
    assert short_id("1234567890abcdefghij") == "1234567890abcde"


def test_short_id_supports_custom_length():
    assert short_id("abcdef", length=3) == "abc"


def test_short_id_returns_original_when_shorter_than_limit():
    assert short_id("abc", length=10) == "abc"


def test_short_id_returns_unknown_for_falsy_values():
    assert short_id("") == "unknown"
    assert short_id(None) == "unknown"
