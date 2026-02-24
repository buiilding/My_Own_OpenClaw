import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()
browser_use_python_root = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "main"
    / "python"
    / "tools"
    / "browser"
)
browser_use_python_root_str = str(browser_use_python_root)
if browser_use_python_root_str not in sys.path:
    sys.path.insert(0, browser_use_python_root_str)

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
