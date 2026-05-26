import importlib
import logging
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes.memory import health as health_routes
from backend.src.api.routes.memory.embeddings.models import EmbeddingRequest
from backend.src.api.routes.memory.embeddings.router import (
    generate_embedding,
    health_check as embeddings_health_check,
    logger as embeddings_logger,
)
from backend.src.api.auth.context import AuthenticatedInstallIdentity
from backend.src.api.routes.memory.semantic.parser import (
    extract_fallback_facts,
    parse_summarization_response,
)
from backend.src.core.inference import EmbeddingRouter

semantic_routes = importlib.import_module(
    "backend.src.api.routes.memory.semantic.router"
)
from backend.src.core.config.models import AppConfig

restore_route_deps_shim(_original_deps)


class FakeArray:
    def __init__(self, values):
        self._values = values

    def tolist(self):
        return list(self._values)


class FakeEmbedder:
    provider_id = "fake-provider"
    model_id = "fake-embedder-v1"
    model_name = "fake-embedder"
    dimension = 3

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


def _local_ollama_config(model_id: str) -> AppConfig:
    return AppConfig(
        model_mode="local",
        model_provider="ollama",
        selected_model_id=model_id,
    )


def _container_with_embedding_provider(provider=None) -> SimpleNamespace:
    return SimpleNamespace(embedding_router=EmbeddingRouter(provider))


def _patch_semantic_client(monkeypatch, fake_client: FakeLLMClient) -> None:
    monkeypatch.setattr(semantic_routes, "get_llm_client", lambda cfg: fake_client)
    monkeypatch.setattr(semantic_routes, "load_api_key_for_provider", lambda cfg: cfg)


@pytest.fixture
def authenticated_user(monkeypatch):
    identity_holder = {"identity": None}

    monkeypatch.setattr(
        semantic_routes,
        "get_current_authenticated_install_identity",
        lambda: identity_holder["identity"],
    )

    def _authenticate(user_id: str) -> AuthenticatedInstallIdentity:
        identity = AuthenticatedInstallIdentity(
            user_id=user_id,
            install_id=f"install-{user_id}",
        )
        identity_holder["identity"] = identity
        return identity

    return _authenticate


@pytest.mark.asyncio
async def test_generate_embedding_success() -> None:
    container = _container_with_embedding_provider(FakeEmbedder())
    request = EmbeddingRequest(text="hello")

    result = await generate_embedding(request, container)

    assert result.model_name == "fake-embedder"
    assert result.provider_id == "fake-provider"
    assert result.model_id == "fake-embedder-v1"
    assert result.dimension == 3
    assert result.embedding == [0.1, 0.2, 0.3]
    assert result.embedding_space_version == "fake-provider:fake-embedder-v1:3"


@pytest.mark.asyncio
async def test_generate_embedding_uses_embedding_router_when_present() -> None:
    embedder = FakeEmbedder()
    container = _container_with_embedding_provider(embedder)
    request = EmbeddingRequest(text="hello")

    result = await generate_embedding(request, container)

    assert result.model_name == "fake-embedder"
    assert result.provider_id == "fake-provider"
    assert result.dimension == 3


@pytest.mark.asyncio
async def test_generate_embedding_logs_route_start_and_success(caplog) -> None:
    container = _container_with_embedding_provider(FakeEmbedder())
    request = EmbeddingRequest(text="hello")

    with caplog.at_level(logging.INFO, logger=embeddings_logger.name):
        result = await generate_embedding(request, container)

    assert result.dimension == 3
    assert "[MemoryRoute] /api/embeddings start chars=5 model=default" in caplog.text
    assert (
        "[MemoryRoute] /api/embeddings success chars=5 model=default dimension=3"
        in caplog.text
    )


@pytest.mark.asyncio
async def test_generate_embedding_returns_503_when_embedder_missing(caplog) -> None:
    container = _container_with_embedding_provider()
    request = EmbeddingRequest(text="hello")

    with caplog.at_level(logging.INFO, logger=embeddings_logger.name):
        with pytest.raises(HTTPException) as exc_info:
            await generate_embedding(request, container)

    assert exc_info.value.status_code == 503
    assert (
        "[MemoryRoute] /api/embeddings failure chars=5 model=default status=503"
        in caplog.text
    )
    failure_records = [
        record for record in caplog.records
        if "[MemoryRoute] /api/embeddings failure" in record.message
    ]
    assert len(failure_records) == 1


@pytest.mark.asyncio
async def test_embeddings_health_check_unhealthy_on_failure() -> None:
    container = _container_with_embedding_provider(FakeEmbedder(should_raise=True))

    result = await embeddings_health_check(container)

    assert result["status"] == "unhealthy"


@pytest.mark.asyncio
async def test_embeddings_health_check_unhealthy_without_provider() -> None:
    container = _container_with_embedding_provider()

    result = await embeddings_health_check(container)

    assert result == {
        "status": "unhealthy",
        "message": "Embedding provider not available",
    }


@pytest.mark.asyncio
async def test_embeddings_health_check_reports_embedder_model_name() -> None:
    container = _container_with_embedding_provider(FakeEmbedder())

    result = await embeddings_health_check(container)

    assert result["status"] == "healthy"
    assert result["provider_id"] == "fake-provider"
    assert result["model_id"] == "fake-embedder-v1"
    assert result["model_name"] == "fake-embedder"
    assert result["embedding_space_version"] == "fake-provider:fake-embedder-v1:3"


def test_parse_summarization_response_extracts_summary_and_facts() -> None:
    text = (
        "**SUMMARY:** User prefers Python workflows.\n\n"
        "FACTS:\n"
        "- Uses Linux daily\n"
        "- Prefers terminal tools\n"
    )

    summary, facts = parse_summarization_response(text)

    assert "prefers Python" in summary
    assert facts == ["Uses Linux daily", "Prefers terminal tools"]


def test_parse_summarization_response_extracts_bold_fact_label() -> None:
    text = (
        "**SUMMARY:** User prefers Python workflows.\n\n"
        "**FACTS:**\n"
        "- Uses Linux daily\n"
        "- Prefers terminal tools\n"
    )

    summary, facts = parse_summarization_response(text)

    assert "prefers Python" in summary
    assert facts == ["Uses Linux daily", "Prefers terminal tools"]


def test_extract_fallback_facts_filters_short_lines() -> None:
    text = "- ok\n- uses codex heavily\n- x\n* likes shell scripts"

    facts = extract_fallback_facts(text)

    assert "uses codex heavily" in facts
    assert "likes shell scripts" in facts
    assert "ok" not in facts
    assert "x" not in facts


@pytest.mark.asyncio
async def test_summarize_conversations_uses_session_config(
    monkeypatch,
    authenticated_user,
) -> None:
    session_cfg = _local_ollama_config("session-model")
    container_cfg = _local_ollama_config("container-model")
    fake_client = FakeLLMClient(
        "SUMMARY: concise summary\n\nFACTS:\n- likes tests\n- values reliability\n"
    )

    _patch_semantic_client(monkeypatch, fake_client)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    session = SimpleNamespace(cfg=session_cfg)
    session_manager = FakeSessionManager(session=session)
    request = semantic_routes.SummarizeRequest(
        conversations=["User: hi\nAssistant: hello"],
        user_id="user_123",
    )
    authenticated_user("user_123")

    response = await semantic_routes.summarize_conversations(
        request, container, session_manager
    )

    assert response.success is True
    assert response.summary == "concise summary"
    assert "likes tests" in response.facts
    assert fake_client.calls
    assert fake_client.calls[0][0] == "session-model"


@pytest.mark.asyncio
async def test_summarize_conversations_logs_route_start_and_success(
    monkeypatch, caplog, authenticated_user
) -> None:
    container_cfg = _local_ollama_config("container-model")
    fake_client = FakeLLMClient(
        "SUMMARY: short summary\n\nFACTS:\n- fact one\n- fact two\n"
    )

    _patch_semantic_client(monkeypatch, fake_client)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    session_manager = FakeSessionManager(session=None)
    request = semantic_routes.SummarizeRequest(
        conversations=["User: hi\nAssistant: hello"],
        user_id="user_123",
    )
    authenticated_user("user_123")

    with caplog.at_level(logging.INFO, logger=semantic_routes.logger.name):
        response = await semantic_routes.summarize_conversations(
            request,
            container,
            session_manager,
        )

    assert response.success is True
    assert (
        "[MemoryRoute] /api/semantic/summarize start user_id=user_123 conversations=1"
        in caplog.text
    )
    assert (
        "[MemoryRoute] /api/semantic/summarize success user_id=user_123 facts=2"
        in caplog.text
    )


@pytest.mark.asyncio
async def test_summarize_conversations_requires_authenticated_identity(
    monkeypatch,
) -> None:
    fake_client = FakeLLMClient(
        "SUMMARY: should not run\n\nFACTS:\n- should not run\n"
    )
    _patch_semantic_client(monkeypatch, fake_client)
    request = semantic_routes.SummarizeRequest(
        conversations=["User: hi\nAssistant: hello"],
        user_id="user_123",
    )

    with pytest.raises(HTTPException) as exc_info:
        await semantic_routes.summarize_conversations(
            request,
            SimpleNamespace(config=_local_ollama_config("container-model")),
            FakeSessionManager(),
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert fake_client.calls == []


@pytest.mark.asyncio
async def test_summarize_conversations_rejects_body_user_id_mismatch(
    monkeypatch,
    authenticated_user,
) -> None:
    authenticated_user("authenticated_user")
    fake_client = FakeLLMClient(
        "SUMMARY: should not run\n\nFACTS:\n- should not run\n"
    )
    _patch_semantic_client(monkeypatch, fake_client)
    request = semantic_routes.SummarizeRequest(
        conversations=["User: hi\nAssistant: hello"],
        user_id="body_user",
    )

    with pytest.raises(HTTPException) as exc_info:
        await semantic_routes.summarize_conversations(
            request,
            SimpleNamespace(config=_local_ollama_config("container-model")),
            FakeSessionManager(),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Semantic route cannot act as another user"
    assert fake_client.calls == []


@pytest.mark.asyncio
async def test_summarize_conversations_does_not_use_other_active_session(
    monkeypatch,
    authenticated_user,
) -> None:
    other_session_cfg = _local_ollama_config("other-active-session-model")
    container_cfg = _local_ollama_config("container-model")
    fake_client = FakeLLMClient(
        "SUMMARY: container summary\n\nFACTS:\n- from container config\n"
    )

    _patch_semantic_client(monkeypatch, fake_client)

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
    authenticated_user("request-user-without-session")

    response = await semantic_routes.summarize_conversations(
        request, container, session_manager
    )

    assert response.success is True
    assert response.summary == "container summary"
    assert fake_client.calls
    assert fake_client.calls[0][0] == "container-model"


@pytest.mark.asyncio
async def test_generate_conversation_title_uses_session_config_and_model_override(
    monkeypatch,
    authenticated_user,
) -> None:
    session_cfg = _local_ollama_config("session-model")
    container_cfg = _local_ollama_config("container-model")
    fake_client = FakeLLMClient('Title:   "Good to Meet You"')

    _patch_semantic_client(monkeypatch, fake_client)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    session = SimpleNamespace(cfg=session_cfg)
    session_manager = FakeSessionManager(session=session)
    request = semantic_routes.GenerateTitleRequest(
        user_id="user_123",
        user_message="good to meet you",
        assistant_message="Good to meet you too! I can help with your desktop tasks.",
        model_id="k2p5",
        model_provider="kimi-coding",
    )
    authenticated_user("user_123")

    response = await semantic_routes.generate_conversation_title(
        request,
        container,
        session_manager,
    )

    assert response.success is True
    assert response.title == "Good to Meet You"
    assert fake_client.calls
    assert fake_client.calls[0][0] == "k2p5"


@pytest.mark.asyncio
async def test_generate_conversation_title_logs_route_start_and_success(
    monkeypatch, caplog, authenticated_user
) -> None:
    container_cfg = _local_ollama_config("container-model")
    fake_client = FakeLLMClient("Mission Planning")

    _patch_semantic_client(monkeypatch, fake_client)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    session_manager = FakeSessionManager(session=None)
    request = semantic_routes.GenerateTitleRequest(
        user_id="user_456",
        user_message="plan moon mission",
        assistant_message="Let's break it down into launch, transit, and landing phases.",
    )
    authenticated_user("user_456")

    with caplog.at_level(logging.INFO, logger=semantic_routes.logger.name):
        response = await semantic_routes.generate_conversation_title(
            request,
            container,
            session_manager,
        )

    assert response.success is True
    assert (
        "[MemoryRoute] /api/semantic/title start user_id=user_456 conversations=- user_chars=17 assistant_chars=61"
        in caplog.text
    )
    assert (
        "[MemoryRoute] /api/semantic/title success user_id=user_456 facts=- title_chars=16"
        in caplog.text
    )


@pytest.mark.asyncio
async def test_generate_conversation_title_uses_container_config_when_session_missing(
    monkeypatch,
    authenticated_user,
) -> None:
    container_cfg = _local_ollama_config("container-model")
    fake_client = FakeLLMClient("Mission Planning")

    _patch_semantic_client(monkeypatch, fake_client)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    session_manager = FakeSessionManager(session=None)
    request = semantic_routes.GenerateTitleRequest(
        user_id="user_456",
        user_message="plan moon mission",
        assistant_message="Let's break it down into launch, transit, and landing phases.",
    )
    authenticated_user("user_456")

    response = await semantic_routes.generate_conversation_title(
        request,
        container,
        session_manager,
    )

    assert response.success is True
    assert response.title == "Mission Planning"
    assert fake_client.calls
    assert fake_client.calls[0][0] == "container-model"


@pytest.mark.asyncio
async def test_generate_conversation_title_requires_authenticated_identity(
    monkeypatch,
) -> None:
    fake_client = FakeLLMClient("Should Not Run")
    _patch_semantic_client(monkeypatch, fake_client)
    request = semantic_routes.GenerateTitleRequest(
        user_id="user_456",
        user_message="plan moon mission",
        assistant_message="Let's break it down.",
    )

    with pytest.raises(HTTPException) as exc_info:
        await semantic_routes.generate_conversation_title(
            request,
            SimpleNamespace(config=_local_ollama_config("container-model")),
            FakeSessionManager(),
        )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authenticated install identity required"
    assert fake_client.calls == []


@pytest.mark.asyncio
async def test_generate_conversation_title_rejects_body_user_id_mismatch(
    monkeypatch,
    authenticated_user,
) -> None:
    authenticated_user("authenticated_user")
    fake_client = FakeLLMClient("Should Not Run")
    _patch_semantic_client(monkeypatch, fake_client)
    request = semantic_routes.GenerateTitleRequest(
        user_id="body_user",
        user_message="plan moon mission",
        assistant_message="Let's break it down.",
    )

    with pytest.raises(HTTPException) as exc_info:
        await semantic_routes.generate_conversation_title(
            request,
            SimpleNamespace(config=_local_ollama_config("container-model")),
            FakeSessionManager(),
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Semantic route cannot act as another user"
    assert fake_client.calls == []


@pytest.mark.asyncio
async def test_generate_conversation_title_trims_to_short_concise_shape(
    monkeypatch,
    authenticated_user,
) -> None:
    container_cfg = _local_ollama_config("container-model")
    fake_client = FakeLLMClient(
        "Title: Extremely long descriptive title with too many words and extra detail"
    )

    _patch_semantic_client(monkeypatch, fake_client)

    container = SimpleNamespace(config=container_cfg, llm_client=object())
    session_manager = FakeSessionManager(session=None)
    request = semantic_routes.GenerateTitleRequest(
        user_id="user_789",
        user_message="help me plan migration",
        assistant_message="Let's draft phases and risk mitigation steps.",
    )
    authenticated_user("user_789")

    response = await semantic_routes.generate_conversation_title(
        request,
        container,
        session_manager,
    )

    assert response.success is True
    assert response.title == "Extremely long descriptive title with too"


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
async def test_dependency_health_check_returns_unhealthy_when_dependency_missing() -> (
    None
):
    result = await health_routes.dependency_health_check(
        dependency=None,
        missing_message="Dependency missing",
        on_healthy=lambda _dep: health_routes.healthy_payload(message="ok"),
        logger=semantic_routes.logger,
        error_log_prefix="test",
    )

    assert result == {"status": "unhealthy", "message": "Dependency missing"}


@pytest.mark.asyncio
async def test_dependency_health_check_supports_sync_and_async_callbacks() -> None:
    sync_result = await health_routes.dependency_health_check(
        dependency=object(),
        missing_message="Dependency missing",
        on_healthy=lambda _dep: health_routes.healthy_payload(message="sync-ok"),
        logger=semantic_routes.logger,
        error_log_prefix="test",
    )

    async def async_on_healthy(_dep):
        return health_routes.healthy_payload(message="async-ok")

    async_result = await health_routes.dependency_health_check(
        dependency=object(),
        missing_message="Dependency missing",
        on_healthy=async_on_healthy,
        logger=semantic_routes.logger,
        error_log_prefix="test",
    )

    assert sync_result == {"status": "healthy", "message": "sync-ok"}
    assert async_result == {"status": "healthy", "message": "async-ok"}


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


def test_generate_title_request_rejects_default_user() -> None:
    with pytest.raises(ValidationError):
        semantic_routes.GenerateTitleRequest(
            user_id="default_user",
            user_message="hi",
            assistant_message="hello",
        )
