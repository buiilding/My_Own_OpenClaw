from types import SimpleNamespace

from backend.src.agent.session.session_config_service import SessionConfigService
from backend.src.agent.session.session_registry import SessionRegistry
from backend.src.core.config.models import AppConfig


class _DummySession:
    def __init__(self) -> None:
        self.prompt_builder = SimpleNamespace(system_prompt="default")
        self.history = SimpleNamespace(system_prompt="default")


def test_session_config_service_applies_frontend_operating_system_to_active_sessions():
    registry = SessionRegistry()
    session = _DummySession()
    registry.store_session("user-1", session, conversation_ref="conv-a")
    service = SessionConfigService(
        base_config=AppConfig(),
        registry=registry,
        assemble_runtime_session_config=lambda cfg: cfg,
        render_system_prompt=lambda operating_system=None: f"prompt:{operating_system}",
    )

    service.set_frontend_operating_system("user-1", "Windows")

    assert session.prompt_builder.system_prompt == "prompt:Windows"
    assert session.history.system_prompt == "prompt:Windows"


def test_session_config_service_builds_effective_config_with_user_overrides():
    registry = SessionRegistry()
    service = SessionConfigService(
        base_config=AppConfig(),
        registry=registry,
        assemble_runtime_session_config=lambda cfg: cfg,
        render_system_prompt=lambda operating_system=None: f"prompt:{operating_system}",
    )
    service.user_config_overrides["user-1"] = {"model_provider": "anthropic"}

    cfg = service.build_effective_config("user-1")

    assert cfg.model_provider == "anthropic"
