from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from tests.sidecar.browser_use_test_utils import ensure_local_browser_use_path

ensure_local_browser_use_path()

from browser_use.llm.exceptions import ModelProviderError
from browser_use.llm.google.chat import ChatGoogle
from browser_use.llm.openai.chat import ChatOpenAI


def test_openai_choice_helper_returns_first_choice():
    llm = ChatOpenAI(model="gpt-4o-mini")
    first_choice = SimpleNamespace(message=SimpleNamespace(content="ok"), finish_reason="stop")
    response = SimpleNamespace(choices=[first_choice])

    assert llm._get_first_choice_or_raise(response) is first_choice


def test_openai_choice_helper_raises_with_proxy_hint():
    llm = ChatOpenAI(model="gpt-4o-mini", base_url="https://proxy.example/v1")
    response = SimpleNamespace(choices=[])

    with pytest.raises(ModelProviderError) as error:
        llm._get_first_choice_or_raise(response)

    assert error.value.status_code == 502
    assert "/v1/chat/completions" in error.value.message
    assert "base_url=https://proxy.example/v1" in error.value.message


@pytest.mark.parametrize(
    ("raw_text", "expected"),
    [
        ("```json\n{\"a\":1}\n```", "{\"a\":1}"),
        ("```\n{\"a\":1}\n```", "{\"a\":1}"),
        (" {\"a\":1} ", "{\"a\":1}"),
    ],
)
def test_google_strip_markdown_code_fence(raw_text, expected):
    assert ChatGoogle._strip_markdown_code_fence(raw_text) == expected


def test_google_parse_json_text_response_returns_typed_completion():
    class _Output(BaseModel):
        value: int

    llm = ChatGoogle(model="gemini-2.5-flash")
    response = SimpleNamespace(candidates=[SimpleNamespace(finish_reason="stop")])

    result = llm._parse_json_text_response(
        raw_text="```json\n{\"value\": 3}\n```",
        output_format=_Output,
        usage=None,
        response=response,
    )

    assert isinstance(result.completion, _Output)
    assert result.completion.value == 3
    assert result.stop_reason == "stop"


def test_google_parse_json_text_response_raises_on_invalid_json():
    class _Output(BaseModel):
        value: int

    llm = ChatGoogle(model="gemini-2.5-flash")
    response = SimpleNamespace(candidates=[SimpleNamespace(finish_reason="stop")])

    with pytest.raises(ValueError):
        llm._parse_json_text_response(
            raw_text="not json",
            output_format=_Output,
            usage=None,
            response=response,
        )
