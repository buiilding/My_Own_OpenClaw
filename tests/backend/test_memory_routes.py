from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes.memory import embeddings as embeddings_routes
from backend.src.api.routes.memory import health as health_routes
from backend.src.api.routes.memory import semantic as semantic_routes
from backend.src.core.config.models import AppConfig

restore_route_deps_shim(_original_deps)


class FakeArray:
    def __init__(self, values):
        self._values = values

    def tolist(self):
        return list(self._values)


class FakeEmbedder:
    model_name = "fake-embedder"

    def __init__(self, should_raise: bool = False):
        self.should_raise = should_raise

    async def embed_text(self, _text: str):
        if self.should_raise:
            raise RuntimeError("embedding failure")
        return FakeArray([0.1, 0.2, 0.3])


class FakeLLMClient:
    def __init__(self, response_text: str):
        self.response_text = response_text
        self.calls = []

    async def get_completion(self, model, messages):
        self.calls.append((model, messages))
        return self.response_text


class FakeSessionManager:
    def __init__(self, session=None, active_sessions=None):
        self._session = session
        self.active_sessions = active_sessions or {}

    def get_session(self, _user_id):
        return self._session


@pytest.mark.asyncio
async def test_generate_embedding_success() -> None:
    container = SimpleNamespace(embedder=FakeEmbedder())
    request = embeddings_routes.EmbeddingRequest(text="hello")

    result = await embeddings_routes.generate_embedding(request, container)

    assert result.model_name == "fake-embedder"
    assert result.dimension == 3
    assert result.embedding == [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_generate_embedding_returns_503_when_embedder_missing() -> None:
    container = SimpleNamespace(embedder=None)
    request = embeddings_routes.EmbeddingRequest(text="hello")

    with pytest.raises(HTTPException) as exc_info:
        await embeddings_routes.generate_embedding(request, container)

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_embeddings_health_check_unhealthy_on_failure() -> None:
    container = SimpleNamespace(embedder=FakeEmbedder(should_raise=True))

    result = await embeddings_routes.health_check(container)

    assert result["status"] == "unhealthy"


def test_parse_summarization_response_extracts_summary_and_facts() -> None:
    text = (
        "**SUMMARY:** User prefers Python workflows.\n\n"
        "FACTS:\n"
        "- Uses Linux daily\n"
        "- Prefers terminal tools\n"
    )

    summary, facts = semantic_routes._parse_summarization_response(text)

    assert "prefers Python" in summary
    assert facts == ["Uses Linux daily", "Prefers terminal tools"]


def test_extract_fallback_facts_filters_short_lines() -> None:
    text = "- ok\n- uses codex heavily\n- x\n* likes shell scripts"

    facts = semantic_routes._extract_fallback_facts(text)

    assert "uses codex heavily" in facts
    assert "likes shell scripts" in facts
    assert "ok" not in facts
    assert "x" not in facts


@pytest.mark.asyncio
async def test_summarize_conversations_uses_session_config(monkeypatch) -> None:
    session_cfg = AppConfig(
        model_mode="local",
        model_provider="ollama",
        selected_model_id="session-model",
    )
    container_cfg = AppConfig(
        model_mode="local",
        model_provider="ollama",
        selected_model_id="container-model",
    )
    fake_client = FakeLLMClient(
        "SUMMARY: concise summary\n\nFACTS:\n- likes tests\n- values reliability\n"
    )

    monkeypatch.setattr(semantic_routes, "get_llm_client", lambda cfg: fake_client)
    monkeypatch.setattr(semantic_routes, "load_api_key_for_provider", lambda cfg: cfg)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    session = SimpleNamespace(cfg=session_cfg)
    session_manager = FakeSessionManager(session=session)
    request = semantic_routes.SummarizeRequest(
        conversations=["User: hi\nAssistant: hello"],
        user_id="user_123",
    )

    response = await semantic_routes.summarize_conversations(
        request, container, session_manager
    )

    assert response.success is True
    assert response.summary == "concise summary"
    assert "likes tests" in response.facts
    assert fake_client.calls
    assert fake_client.calls[0][0] == "session-model"


@pytest.mark.asyncio
async def test_summarize_conversations_does_not_use_other_active_session(monkeypatch) -> None:
    other_session_cfg = AppConfig(
        model_mode="local",
        model_provider="ollama",
        selected_model_id="other-active-session-model",
    )
    container_cfg = AppConfig(
        model_mode="local",
        model_provider="ollama",
        selected_model_id="container-model",
    )
    fake_client = FakeLLMClient("SUMMARY: container summary\n\nFACTS:\n- from container config\n")

    monkeypatch.setattr(semantic_routes, "get_llm_client", lambda cfg: fake_client)
    monkeypatch.setattr(semantic_routes, "load_api_key_for_provider", lambda cfg: cfg)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    other_active_session = SimpleNamespace(cfg=other_session_cfg)
    session_manager = FakeSessionManager(
        session=None,
        active_sessions={"some-other-user": other_active_session},
    )
    request = semantic_routes.SummarizeRequest(
        conversations=["User: hi\nAssistant: hello"],
        user_id="request-user-without-session",
    )

    response = await semantic_routes.summarize_conversations(
        request, container, session_manager
    )

    assert response.success is True
    assert response.summary == "container summary"
    assert fake_client.calls
    assert fake_client.calls[0][0] == "container-model"


@pytest.mark.asyncio
async def test_semantic_health_check_reports_status() -> None:
    healthy = await semantic_routes.health_check(SimpleNamespace(llm_client=object()))
    unhealthy = await semantic_routes.health_check(SimpleNamespace(llm_client=None))

    assert healthy["status"] == "healthy"
    assert unhealthy["status"] == "unhealthy"


@pytest.mark.asyncio
async def test_safe_health_check_returns_check_result() -> None:
    async def check():
        return health_routes.healthy_payload(message="ok")

    result = await health_routes.safe_health_check(
        check,
        logger=semantic_routes.logger,
        error_log_prefix="test",
    )

    assert result == {"status": "healthy", "message": "ok"}


@pytest.mark.asyncio
async def test_safe_health_check_returns_unhealthy_on_exception() -> None:
    async def check():
        raise RuntimeError("boom")

    result = await health_routes.safe_health_check(
        check,
        logger=semantic_routes.logger,
        error_log_prefix="test",
    )

    assert result == {"status": "unhealthy", "message": "Health check failed"}


@pytest.mark.asyncio
async def test_semantic_health_check_unhealthy_on_exception() -> None:
    class RaisingContainer:
        @property
        def llm_client(self):
            raise RuntimeError("container read failure")

    result = await semantic_routes.health_check(RaisingContainer())

    assert result["status"] == "unhealthy"
    assert result["message"] == "Health check failed"


def test_summarize_request_rejects_default_user() -> None:
    with pytest.raises(ValidationError):
        semantic_routes.SummarizeRequest(
            conversations=["conversation text"],
            user_id="default_user",
        )
