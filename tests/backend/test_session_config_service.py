"""Covers session config service behavior in the backend test suite."""

from types import SimpleNamespace

from backend.src.agent.session.session_config_service import SessionConfigService
from backend.src.agent.session.session_registry import SessionRegistry
from backend.src.core.config.models import AppConfig


class _DummySession:
    def __init__(self) -> None:
        self.prompt_builder = SimpleNamespace(system_prompt="default")
        self.history = SimpleNamespace(system_prompt="default")
        self.runtime = SimpleNamespace(
            workspace_path=None,
            repo_instruction_messages=[],
            client_prompt_layers=[],
            agent_definition=None,
        )


class _AgentDefinitionWithPromptContext:
    runtime = SimpleNamespace(
        workspace_path="/agent-workspace", operating_system="TestOS"
    )

    def system_prompt_override(self) -> str:
        return "Agent prompt"

    def client_prompt_layers(self) -> list[dict[str, object]]:
        return []


def test_session_config_service_applies_client_operating_system_to_active_sessions():
    registry = SessionRegistry()
    session = _DummySession()
    registry.store_session("user-1", session, conversation_ref="conv-a")
    service = SessionConfigService(
        base_config=AppConfig(),
        registry=registry,
        assemble_runtime_session_config=lambda cfg: cfg,
        render_system_prompt=lambda operating_system=None: f"prompt:{operating_system}",
    )

    service.set_client_operating_system("user-1", "Windows")

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


def test_session_config_service_merges_provider_unavailable_capabilities():
    registry = SessionRegistry()
    service = SessionConfigService(
        base_config=AppConfig(agent_provider_unavailable_capabilities=["ocr"]),
        registry=registry,
        assemble_runtime_session_config=lambda cfg: cfg,
        render_system_prompt=lambda operating_system=None: f"prompt:{operating_system}",
        provider_health_resolver=lambda cfg: ["vision", "web_search"],
    )

    cfg = service.build_effective_config("user-1")

    assert cfg.agent_provider_unavailable_capabilities == [
        "ocr",
        "vision",
        "web_search",
    ]


def test_apply_agent_definition_preserves_existing_repo_instruction_messages():
    registry = SessionRegistry()
    session = _DummySession()
    session.runtime.repo_instruction_messages = [
        {"role": "user", "content": "Use repo instructions."},
    ]
    session.prompt_builder.repo_instruction_messages = [
        {"role": "user", "content": "Use repo instructions."},
    ]
    service = SessionConfigService(
        base_config=AppConfig(),
        registry=registry,
        assemble_runtime_session_config=lambda cfg: cfg,
        render_system_prompt=lambda operating_system=None: f"prompt:{operating_system}",
    )

    service.apply_agent_definition_to_session(
        session,
        _AgentDefinitionWithPromptContext(),
    )

    assert session.runtime.agent_definition is not None
    assert session.runtime.workspace_path == "/agent-workspace"
    assert session.prompt_builder.system_prompt == (
        "Provided operating system: TestOS\n"
        "Provided workspace: /agent-workspace\n\n"
        "Agent prompt"
    )
    assert session.history.system_prompt == session.prompt_builder.system_prompt
    assert session.runtime.repo_instruction_messages == [
        {"role": "user", "content": "Use repo instructions."},
    ]
    assert session.prompt_builder.repo_instruction_messages == [
        {"role": "user", "content": "Use repo instructions."},
    ]
