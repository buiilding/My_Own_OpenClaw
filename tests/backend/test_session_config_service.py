"""Covers session config service behavior in the backend test suite."""

import asyncio
from types import SimpleNamespace

import pytest

from backend.src.agent.session.session_config_service import SessionConfigService
from backend.src.agent.session.session_registry import SessionRegistry
from backend.src.core.config.models import AppConfig


class _DummySession:
    def __init__(self) -> None:
        self.cfg = AppConfig()
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


class _ConfigSession(_DummySession):
    def __init__(self, cfg: AppConfig | None = None) -> None:
        super().__init__()
        self.cfg = cfg or self.cfg
        self.try_update_calls = 0
        self.update_calls = 0

    async def try_update_config(self, new_cfg: AppConfig) -> bool:
        self.try_update_calls += 1
        self.cfg = new_cfg
        return True

    async def update_config(self, new_cfg: AppConfig) -> None:
        self.update_calls += 1
        self.cfg = new_cfg


class _BusyConfigSession(_ConfigSession):
    def __init__(self, cfg: AppConfig | None = None) -> None:
        super().__init__(cfg)
        self.deferred_update_started = asyncio.Event()
        self.release_deferred_update = asyncio.Event()

    async def try_update_config(self, new_cfg: AppConfig) -> bool:  # noqa: ARG002
        self.try_update_calls += 1
        return False

    async def update_config(self, new_cfg: AppConfig) -> None:
        self.update_calls += 1
        self.deferred_update_started.set()
        await self.release_deferred_update.wait()
        self.cfg = new_cfg


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


@pytest.mark.asyncio
async def test_update_session_config_applies_immediately_when_session_is_not_busy():
    registry = SessionRegistry()
    session = _ConfigSession()
    registry.store_session("user-1", session, conversation_ref="conv-a")
    service = SessionConfigService(
        base_config=AppConfig(),
        registry=registry,
        assemble_runtime_session_config=lambda cfg: cfg,
        render_system_prompt=lambda operating_system=None: f"prompt:{operating_system}",
    )

    await service.update_session_config("user-1", {"model_provider": "anthropic"})

    assert session.try_update_calls == 1
    assert session.update_calls == 0
    assert session.cfg.model_provider == "anthropic"
    assert service._deferred_update_tasks == {}


@pytest.mark.asyncio
async def test_update_session_config_defers_busy_session_without_blocking_handler():
    registry = SessionRegistry()
    session = _BusyConfigSession()
    registry.store_session("user-1", session, conversation_ref="conv-a")
    service = SessionConfigService(
        base_config=AppConfig(),
        registry=registry,
        assemble_runtime_session_config=lambda cfg: cfg,
        render_system_prompt=lambda operating_system=None: f"prompt:{operating_system}",
    )

    await asyncio.wait_for(
        service.update_session_config("user-1", {"model_provider": "anthropic"}),
        timeout=0.1,
    )
    await asyncio.wait_for(session.deferred_update_started.wait(), timeout=0.1)

    assert session.try_update_calls == 1
    assert session.update_calls == 1
    assert session.cfg.model_provider == "openai"
    assert len(service._deferred_update_tasks) == 1

    await asyncio.wait_for(
        service.update_session_config("user-1", {"model_provider": "gemini"}),
        timeout=0.1,
    )

    # The second update should reuse the existing deferred task instead of
    # creating another websocket-visible waiter.
    assert len(service._deferred_update_tasks) == 1

    deferred_task = next(iter(service._deferred_update_tasks.values()))
    session.release_deferred_update.set()
    await asyncio.wait_for(deferred_task, timeout=0.5)

    assert session.cfg.model_provider == "gemini"
    assert service._deferred_update_tasks == {}


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
