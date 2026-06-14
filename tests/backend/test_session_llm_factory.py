"""Covers session llm factory behavior in the backend test suite."""

import pytest

from backend.src.agent.session.session import AgentSession
from backend.src.core.config.models import AppConfig
from backend.src.core.infrastructure.bus import EventBus
from backend.src.core.infrastructure.cache import CacheManager
from backend.src.core.observability.trust_boundary_metrics import MetricsService
from backend.src.llm.client import LLMClient
from backend.src.llm.prompts.prompts import PromptManager
from backend.src.tools.registry import ToolRegistry


class DummyLLMClient(LLMClient):
    def __init__(self, tag: str) -> None:
        self.tag = tag

    async def get_completion(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        return "ok"

    async def get_completion_response(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        return {"content": "ok"}

    async def get_completion_stream(
        self,
        model,
        messages,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        if False:
            yield

    def supports_streaming_tool_turns(self, model):
        _ = model
        return False


@pytest.fixture(autouse=True)
def _init_prompt_manager():
    """Initialize PromptManager for tests."""
    PromptManager().initialize()
    yield


@pytest.mark.asyncio
async def test_update_config_uses_llm_factory():
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    event_bus = EventBus()
    calls = []

    def factory(cfg):
        calls.append(cfg.selected_model_id)
        return DummyLLMClient(cfg.selected_model_id)

    session = AgentSession(
        cfg=config,
        tool_registry=registry,
        ocr_service=None,
        llm_client_factory=factory,
        event_bus=event_bus,
        metrics_service=MetricsService(),
    )

    assert session.llm_client.tag == config.selected_model_id

    new_cfg = AppConfig(
        **{
            **config.model_dump(),
            "model_provider": "kimi-coding",
            "selected_model_id": "k2p5",
        }
    )
    await session.update_config(new_cfg)

    assert session.llm_client.tag == "k2p5"
    assert calls == [config.selected_model_id, "k2p5"]
