from typing import Optional

from backend.src.core.config.models import AppConfig
from backend.src.core.services.context_factory import ContextFactory


class DummySession:
    def __init__(self, metadata):
        self.metadata = metadata
        self.session_id = "session-1"


def test_context_factory_builds_tool_context_with_services():
    config = AppConfig()
    dummy_registry = object()
    session = DummySession(metadata={"active_window": "Terminal"})

    factory = ContextFactory(config=config, tool_registry=dummy_registry)
    factory.set_agent_factory("agent-factory")
    factory.set_vision_service("vision-service")

    context = factory.create_tool_context(
        user_id="user-1",
        session_id="session-1",
        workspace_root="/tmp/workspace",
        session_ref=session,
        additional_services={"extra": 123},
    )

    assert context.user.user_id == "user-1"
    assert context.session.session_id == "session-1"
    assert context.session.metadata["active_window"] == "Terminal"
    assert context.workspace_root == "/tmp/workspace"

    services = context.services
    assert services["config"] is config
    assert services["tool_registry"] is dummy_registry
    assert services["agent_factory"] == "agent-factory"
    assert services["vision_service"] == "vision-service"
    assert services["extra"] == 123


def test_context_factory_uses_factory_session_ref_when_not_overridden():
    config = AppConfig()
    default_session = DummySession(metadata={"active_window": "Browser"})
    factory = ContextFactory(config=config, session_ref=default_session)

    context = factory.create_tool_context(user_id="u1", session_id="s1")

    assert context.services["session"] is default_session
    assert context.session.metadata == {"active_window": "Browser"}


def test_context_factory_session_ref_override_takes_precedence():
    config = AppConfig()
    default_session = DummySession(metadata={"active_window": "Default"})
    override_session = DummySession(metadata={"active_window": "Override"})
    factory = ContextFactory(config=config, session_ref=default_session)

    context = factory.create_tool_context(
        user_id="u1",
        session_id="s1",
        session_ref=override_session,
    )

    assert context.services["session"] is override_session
    assert context.session.metadata["active_window"] == "Override"


def test_context_factory_update_session_ref_affects_future_contexts():
    config = AppConfig()
    first = DummySession(metadata={"active_window": "One"})
    second = DummySession(metadata={"active_window": "Two"})
    factory = ContextFactory(config=config, session_ref=first)

    initial = factory.create_tool_context(user_id="u1", session_id="s1")
    factory.update_session_ref(second)
    updated = factory.create_tool_context(user_id="u1", session_id="s2")

    assert initial.services["session"] is first
    assert updated.services["session"] is second


def test_context_factory_defaults_workspace_to_cwd(monkeypatch):
    config = AppConfig()
    factory = ContextFactory(config=config)
    monkeypatch.setattr("backend.src.core.services.context_factory.os.getcwd", lambda: "/tmp/cwd")

    context = factory.create_tool_context(user_id="u1", session_id="s1")

    assert context.workspace_root == "/tmp/cwd"


def test_context_factory_does_not_attach_session_service_without_session_ref():
    config = AppConfig()
    factory = ContextFactory(config=config)

    context = factory.create_tool_context(user_id="u1", session_id="s1")

    assert "session" not in context.services
    assert context.session.metadata == {}


def test_context_factory_can_remove_optional_services():
    config = AppConfig()
    factory = ContextFactory(config=config)
    factory.set_vision_service("vision")
    factory.set_ocr_service("ocr")
    factory.set_vision_service(None)
    factory.set_ocr_service(None)

    context = factory.create_tool_context(user_id="u1", session_id="s1")

    assert "vision_service" not in context.services
    assert "ocr_service" not in context.services


def test_context_factory_copies_session_metadata_snapshot():
    config = AppConfig()
    session = DummySession(metadata={"active_window": "Terminal"})
    factory = ContextFactory(config=config, session_ref=session)

    context = factory.create_tool_context(user_id="u1", session_id="s1")
    session.metadata["active_window"] = "Changed"

    assert context.session.metadata["active_window"] == "Terminal"
