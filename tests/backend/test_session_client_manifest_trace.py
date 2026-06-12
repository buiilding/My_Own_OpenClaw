from types import SimpleNamespace

import pytest

from backend.src.agent.session.session import AgentSession
from backend.src.core.config.models import AppConfig
from backend.src.core.events.streaming_events import TraceEvent
from backend.src.core.infrastructure.bus import EventBus
from backend.src.core.infrastructure.cache import CacheManager
from backend.src.core.observability.trust_boundary_metrics import MetricsService
from backend.src.llm.client import LLMClient
from backend.src.llm.prompts.prompts import PromptManager
from backend.src.tools.registry import ToolRegistry


class DummyLLMClient(LLMClient):
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


class FakeExecutor:
    async def process_query(self, *_args, **_kwargs):
        yield {"type": "done"}


class FakeAgentDefinition:
    runtime = SimpleNamespace(operating_system=None, workspace_path=None)

    def __init__(self, manifest):
        self._manifest = manifest

    def client_tool_manifest(self):
        return self._manifest

    def client_prompt_layers(self):
        return None

    def system_prompt_override(self):
        return None


@pytest.fixture(autouse=True)
def _init_prompt_manager():
    PromptManager().initialize()
    yield


def _build_session() -> AgentSession:
    config = AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    session = AgentSession(
        cfg=config,
        tool_registry=registry,
        ocr_service=None,
        llm_client_factory=lambda _config: DummyLLMClient(),
        event_bus=EventBus(),
        metrics_service=MetricsService(),
    )
    session.executor = FakeExecutor()
    return session


@pytest.mark.asyncio
async def test_process_query_traces_client_manifest_validation_and_application():
    manifest = {
        "version": 1,
        "tools": [
            {
                "name": "cua_driver__screenshot",
                "description": "Capture the screen through CUA.",
                "execution_target": "sidecar",
                "argument_resolution": "passthrough",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            },
            {
                "name": "bad_tool",
                "execution_target": "sidecar",
                "argument_resolution": "passthrough",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            },
        ],
    }
    session = _build_session()

    events = [
        event
        async for event in session.process_query(
            "check tools",
            agent_definition=FakeAgentDefinition(manifest),
        )
    ]

    trace_events = [event for event in events if isinstance(event, TraceEvent)]
    validate_event = next(
        event for event in trace_events if event.path == "client_tool_manifest.validate"
    )
    apply_event = next(
        event for event in trace_events if event.path == "client_tool_manifest.apply"
    )

    assert validate_event.stage == "validate"
    assert validate_event.status == "succeeded"
    assert validate_event.data == {
        "hasAgentDefinition": True,
        "hasClientManifest": True,
        "rawToolCount": 2,
        "acceptedCount": 1,
        "rejectedCount": 1,
        "acceptedToolNameSample": ["cua_driver__screenshot"],
        "rejectedReasonSample": [
            {"name": "bad_tool", "reason": "description is required"}
        ],
    }
    assert apply_event.stage == "apply"
    assert apply_event.status == "succeeded"
    assert apply_event.data == {
        "acceptedCount": 1,
        "rejectedCount": 1,
        "runtimeAcceptedToolCount": 1,
        "promptBuilderClientToolCount": 1,
        "acceptedToolNameSample": ["cua_driver__screenshot"],
    }
    assert [
        schema.get("name") for schema in session.prompt_builder.client_tool_schemas
    ] == ["cua_driver__screenshot"]
