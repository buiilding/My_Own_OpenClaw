"""Covers session runtime coordinator behavior in the backend test suite."""

from types import SimpleNamespace

from backend.src.core.config.models import AppConfig
from backend.src.core.container.session_runtime import SessionRuntimeCoordinator


class _FakeAgentSession:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def _build_container(*, llm_client, mock_llm_factory=None):
    core = SimpleNamespace(
        event_bus=lambda: object(),
        metrics_service=lambda: object(),
    )
    di_container = SimpleNamespace(
        llm_client=lambda: llm_client,
        tool_orchestrator=lambda: object(),
        core=core,
    )
    return SimpleNamespace(
        config=AppConfig(),
        tool_registry=object(),
        ocr_router=None,
        _di_container=di_container,
        _mock_llm_factory=mock_llm_factory,
    )


def test_default_session_uses_di_llm_client_provider(monkeypatch):
    sentinel_client = object()
    container = _build_container(llm_client=sentinel_client)
    coordinator = SessionRuntimeCoordinator(container)
    monkeypatch.setattr(
        "backend.src.agent.session.session.AgentSession",
        _FakeAgentSession,
    )

    session = coordinator.create_agent_session(user_id="user-1")

    assert session.llm_client is sentinel_client
    assert session.cfg is container.config


def test_explicit_session_config_uses_config_aware_llm_factory(monkeypatch):
    default_client = object()
    override_client = object()
    override_config = AppConfig(selected_model_id="override-model")
    factory_calls = []

    def mock_llm_factory(config):
        factory_calls.append(config)
        return override_client

    container = _build_container(
        llm_client=default_client,
        mock_llm_factory=mock_llm_factory,
    )
    coordinator = SessionRuntimeCoordinator(container)
    monkeypatch.setattr(
        "backend.src.agent.session.session.AgentSession",
        _FakeAgentSession,
    )

    session = coordinator.create_agent_session(
        user_id="user-1",
        config=override_config,
    )

    assert session.llm_client is override_client
    assert session.cfg is override_config
    assert factory_calls == [override_config]
