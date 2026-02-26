from types import SimpleNamespace

import pytest

from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes.memory.semantic_parser import (
    extract_fallback_facts,
    parse_summarization_response,
)
from backend.src.api.routes.memory.semantic_service import (
    FALLBACK_TITLE,
    SemanticSummarizationService,
)
from backend.src.core.config.models import AppConfig

restore_route_deps_shim(_original_deps)


class FakeLLMClient:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.calls = []

    async def get_completion(self, model, messages):
        self.calls.append((model, messages))
        return self._response_text


class FakeSessionManager:
    def __init__(self, session=None):
        self._session = session

    def get_session(self, _user_id):
        return self._session


def _config(*, model_mode: str, provider: str = "openai", api_key: str | None = None) -> AppConfig:
    return AppConfig(
        model_mode=model_mode,
        model_provider=provider,
        selected_model_id="model-x",
        api_key=api_key,
    )


def _build_service(
    *,
    llm_client: FakeLLMClient,
    parse_response_fn,
    fallback_facts_fn,
):
    load_calls = []

    def _get_llm_client(_cfg):
        return llm_client

    def _load_api_key(cfg):
        load_calls.append(cfg)
        return cfg.model_copy(update={"api_key": "loaded-key"})

    service = SemanticSummarizationService(
        get_llm_client_fn=_get_llm_client,
        load_api_key_fn=_load_api_key,
        parse_response_fn=parse_response_fn,
        fallback_facts_fn=fallback_facts_fn,
    )
    return service, load_calls


def test_parse_summarization_response_supports_numbered_fact_lists() -> None:
    text = (
        "SUMMARY: User setup preferences.\n\n"
        "FACTS:\n"
        "1. Uses Linux daily\n"
        "2) Prefers terminal-first workflows\n"
        "- Writes regression tests\n"
    )

    summary, facts = parse_summarization_response(text)

    assert summary == "User setup preferences."
    assert facts == [
        "Uses Linux daily",
        "Prefers terminal-first workflows",
        "Writes regression tests",
    ]


def test_extract_fallback_facts_supports_numbered_and_bulleted_items() -> None:
    text = "1. ok\n2. uses codex heavily\n3) likes shell scripts\n- x"

    facts = extract_fallback_facts(text)

    assert facts == ["uses codex heavily", "likes shell scripts"]


def test_parse_title_response_normalizes_heading_and_trailing_punctuation() -> None:
    parsed = SemanticSummarizationService._parse_title_response(
        '### Title: "Plan migration milestones."'
    )

    assert parsed == "Plan migration milestones"


@pytest.mark.asyncio
async def test_summarize_online_mode_loads_api_key_when_missing() -> None:
    llm_client = FakeLLMClient("SUMMARY: done\n\nFACTS:\n- fact a\n")
    service, load_calls = _build_service(
        llm_client=llm_client,
        parse_response_fn=lambda _text: ("done", ["fact a"]),
        fallback_facts_fn=lambda _text: [],
    )
    container = SimpleNamespace(config=_config(model_mode="online", api_key=None))

    summary, facts = await service.summarize(
        conversations=["User: hi\nAssistant: hello"],
        user_id="user-1",
        container=container,
        session_manager=FakeSessionManager(),
    )

    assert summary == "done"
    assert facts == ["fact a"]
    assert len(load_calls) == 1
    assert llm_client.calls[0][0] == "model-x"


@pytest.mark.asyncio
async def test_summarize_falls_back_when_parser_returns_empty_fields() -> None:
    llm_client = FakeLLMClient("Unstructured memory output from model")
    service, _ = _build_service(
        llm_client=llm_client,
        parse_response_fn=lambda _text: ("", []),
        fallback_facts_fn=lambda _text: ["fallback fact"],
    )
    container = SimpleNamespace(config=_config(model_mode="local"))

    summary, facts = await service.summarize(
        conversations=["User: remember this detail"],
        user_id="user-2",
        container=container,
        session_manager=FakeSessionManager(),
    )

    assert summary == "Unstructured memory output from model"
    assert facts == ["fallback fact"]


@pytest.mark.asyncio
async def test_generate_title_returns_fallback_for_empty_model_response() -> None:
    llm_client = FakeLLMClient("\n\n")
    service, _ = _build_service(
        llm_client=llm_client,
        parse_response_fn=lambda _text: ("unused", []),
        fallback_facts_fn=lambda _text: [],
    )
    container = SimpleNamespace(config=_config(model_mode="local"))

    title = await service.generate_title(
        user_message="help me plan deployment",
        assistant_message="Let us scope environments and rollback first.",
        user_id="user-3",
        container=container,
        session_manager=FakeSessionManager(),
    )

    assert title == FALLBACK_TITLE
