import pytest

from backend.src.agent.session.session import AgentSession
from backend.src.core.config.models import AppConfig
from backend.src.core.infrastructure.bus import EventBus
from backend.src.llm.client import LLMClient
from backend.src.llm.prompts.prompts import PromptManager
from backend.src.tools.registry import ToolRegistry


class DummyLLMClient(LLMClient):
    def __init__(self, tag: str) -> None:
        self.tag = tag

    async def get_completion(self, model, messages):
        return "ok"

    async def get_completion_stream(self, model, messages):
        if False:
            yield


@pytest.fixture(autouse=True)
def _init_prompt_manager():
    """Initialize PromptManager for tests."""
    PromptManager().initialize()
    yield


@pytest.mark.asyncio
async def test_update_config_uses_llm_factory():
    config = AppConfig()
    registry = ToolRegistry(config=config)
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
    )

    assert session.llm_client.tag == "gpt-5.1"

    new_cfg = AppConfig(
        **{
            **config.model_dump(),
            "model_provider": "kimi-coding",
            "selected_model_id": "k2p5",
        }
    )
    await session.update_config(new_cfg)

    assert session.llm_client.tag == "k2p5"
    assert calls == ["gpt-5.1", "k2p5"]
