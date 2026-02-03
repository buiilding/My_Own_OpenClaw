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
