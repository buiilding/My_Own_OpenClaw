"""Covers session client manifest trace behavior in the backend test suite."""

from types import SimpleNamespace

import pytest

from backend.src.agent.session.session import AgentSession
from backend.src.api.schemas.agent_definition import AgentDefinition
from backend.src.core.config.models import AppConfig
from backend.src.core.events.streaming_events import ThinkingEvent, TraceEvent
from backend.src.core.infrastructure.bus import EventBus
from backend.src.core.infrastructure.cache_manager import CacheManager
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
    def __init__(self):
        self.llm_client = None
        self.prompt_builder = None
        self.interaction_loop = SimpleNamespace(
            llm_handler=SimpleNamespace(llm_client=None),
            prompt_coordinator=None,
        )

    async def process_query(self, *_args, **_kwargs):
        yield {"type": "done"}


class FakeAgentDefinition:
    runtime = SimpleNamespace(operating_system=None, workspace_path=None)

    def __init__(self, manifest=None, prompt_layers=None, metadata=None):
        self._manifest = manifest
        self._prompt_layers = prompt_layers
        self.metadata = metadata or {}

    def client_tool_manifest(self):
        return self._manifest

    def client_prompt_layers(self):
        return self._prompt_layers

    def system_prompt_override(self):
        return None


@pytest.fixture(autouse=True)
def _init_prompt_manager():
    PromptManager().initialize()
    yield


def _build_session(config: AppConfig | None = None) -> AgentSession:
    config = config or AppConfig()
    registry = ToolRegistry(config=config, cache_manager=CacheManager())
    session = AgentSession(
        cfg=config,
        tool_registry=registry,
        ocr_router=None,
        llm_client_factory=lambda _config: DummyLLMClient(),
        event_bus=EventBus(),
        metrics_service=MetricsService(),
    )
    session.executor = FakeExecutor()
    return session


@pytest.mark.asyncio
async def test_process_query_no_model_selected_uses_typed_thinking_event():
    config = AppConfig(selected_model_id="")
    session = _build_session(config)

    events = [event async for event in session.process_query("hello")]

    assert len(events) == 1
    assert isinstance(events[0], ThinkingEvent)
    assert events[0].content == "No model selected. Please select a model in settings."


@pytest.mark.asyncio
async def test_process_query_traces_client_manifest_validation_and_application():
    manifest = {
        "version": 1,
        "tools": [
            {
                "name": "cua_driver__screenshot",
                "description": "Capture the screen through CUA.",
                "execution_target": "local_runtime",
                "argument_resolution": "passthrough",
                "mcp_server_id": "cua-driver",
                "mcp_tool_name": "screenshot",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            },
            {
                "name": "bad_tool",
                "execution_target": "local_runtime",
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
    capability_validate_event = next(
        event
        for event in trace_events
        if event.path == "client_capability_manifest.validate"
    )
    capability_apply_event = next(
        event
        for event in trace_events
        if event.path == "client_capability_manifest.apply"
    )
    policy_event = next(
        event
        for event in trace_events
        if event.path == "client_capability_manifest.policy"
    )
    backend_flow_events = [
        event
        for event in trace_events
        if event.path == "agent_definition.backend_flow"
    ]

    assert validate_event.stage == "validate"
    assert validate_event.status == "succeeded"
    assert validate_event.data == {
        "hasAgentDefinition": True,
        "hasClientManifest": True,
        "rawToolCount": 2,
        "capabilityRevision": None,
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
        "capabilityRevision": None,
        "runtimeAcceptedToolCount": 1,
        "promptBuilderClientToolCount": 1,
        "effectiveAvailableToolCount": 1,
        "policyAllowedClientToolCount": 1,
        "acceptedToolNameSample": ["cua_driver__screenshot"],
        "sourceCounts": {
            "builtin": 0,
            "client": 1,
            "mcp": 1,
            "plugin": 0,
            "backend_remote": 0,
        },
    }
    assert capability_validate_event.data == {
        "capabilityRevision": None,
        "rawToolCount": 2,
        "acceptedToolCount": 1,
        "rejectedToolCount": 1,
        "rawPromptLayerCount": 0,
        "acceptedPromptLayerCount": 0,
        "rejectedPromptLayerCount": 0,
        "sourceCounts": {
            "builtin": 0,
            "client": 1,
            "mcp": 1,
            "plugin": 0,
            "backend_remote": 0,
        },
    }
    assert capability_apply_event.data == {
        "capabilityRevision": None,
        "acceptedToolCount": 1,
        "acceptedPromptLayerCount": 0,
        "effectiveAvailableToolCount": 1,
        "toolPolicyRebuilt": True,
        "promptBuilderClientToolCount": 1,
        "promptBuilderPromptLayerCount": 0,
    }
    assert policy_event.data == {
        "capabilityRevision": None,
        "policyInputCount": 1,
        "policyAllowedCount": 1,
        "policyRejectedCount": 0,
        "rejectedByPolicySample": [],
    }
    assert [event.stage for event in backend_flow_events] == [
        "query.receive",
        "agent_definition.receive",
        "runtime_context.resolve",
        "system_prompt_override.resolve",
        "raw_client_manifest.read",
        "client_tool_manifest.validate",
        "tool_policy.apply",
        "prompt_layers.read",
        "prompt_layers.validate",
        "prompt_context.apply",
        "prompt_builder.update",
        "capability_manifest.aggregate",
        "runtime_system_state.merge",
        "model_selection.check",
        "executor.dispatch",
    ]
    assert len(backend_flow_events) == 15
    assert backend_flow_events[0].data == {
        "hasAgentDefinition": True,
        "hasRuntimeContext": False,
        "hasOperatingSystem": False,
        "hasWorkspacePath": False,
        "hasSystemPromptOverride": False,
        "hasClientManifest": True,
        "rawToolCount": 2,
        "acceptedToolCount": 1,
        "rejectedToolCount": 1,
        "rawPromptLayerCount": 0,
        "acceptedPromptLayerCount": 0,
        "rejectedPromptLayerCount": 0,
        "capabilityRevision": None,
        "toolPolicyRebuilt": True,
        "promptContextApplied": False,
        "promptBuilderClientToolCount": 1,
        "promptBuilderPromptLayerCount": 0,
        "policyAllowedClientToolCount": 1,
        "effectiveAvailableToolCount": 1,
        "hasRuntimeSystemState": False,
        "hasSelectedModel": True,
    }
    assert "check tools" not in repr([event.data for event in backend_flow_events])
    assert [
        schema.get("name") for schema in session.prompt_builder.client_tool_schemas
    ] == ["cua_driver__screenshot"]
    _canonical_schemas, provider_schemas = (
        session.prompt_builder.get_tool_schema_surfaces()
    )
    assert [schema.get("name") for schema in provider_schemas] == [
        "cua_driver__screenshot"
    ]
    assert session.cfg.agent_available_tools == ["cua_driver__screenshot"]


@pytest.mark.asyncio
async def test_process_query_traces_prompt_layer_validation_and_application():
    session = _build_session()

    events = [
        event
        async for event in session.process_query(
            "check prompt layers",
            agent_definition=FakeAgentDefinition(
                prompt_layers=[
                    {
                        "id": "skill.review",
                        "type": "extension_skill",
                        "priority": 20,
                        "content": "Lead with risks.",
                        "revision": "rev-1",
                        "source_path": "skills/review/SKILL.md",
                    },
                    {
                        "id": "skill.review",
                        "type": "extension_skill",
                        "priority": 20,
                        "content": "Lead with risks.",
                        "revision": "rev-1",
                    },
                    {"id": "broken", "type": "extension_skill", "content": ""},
                ]
            ),
        )
    ]

    trace_events = [event for event in events if isinstance(event, TraceEvent)]
    validate_event = next(
        event for event in trace_events if event.path == "client_prompt_layers.validate"
    )
    apply_event = next(
        event for event in trace_events if event.path == "client_prompt_layers.apply"
    )
    capability_validate_event = next(
        event
        for event in trace_events
        if event.path == "client_capability_manifest.validate"
    )
    capability_apply_event = next(
        event
        for event in trace_events
        if event.path == "client_capability_manifest.apply"
    )

    assert validate_event.data == {
        "rawLayerCount": 3,
        "capabilityRevision": None,
        "acceptedCount": 1,
        "rejectedCount": 2,
        "acceptedLayerIdSample": ["skill.review"],
        "rejectedReasonSample": [
            {"name": "skill.review", "reason": "duplicate prompt layer"},
            {"name": "broken", "reason": "content is required"},
        ],
    }
    assert apply_event.data == {
        "acceptedCount": 1,
        "rejectedCount": 2,
        "capabilityRevision": None,
        "acceptedLayerIdSample": ["skill.review"],
        "runtimePromptLayerCount": 1,
        "promptBuilderPromptLayerCount": 1,
    }
    assert capability_validate_event.data == {
        "capabilityRevision": None,
        "rawToolCount": 0,
        "acceptedToolCount": 0,
        "rejectedToolCount": 0,
        "rawPromptLayerCount": 3,
        "acceptedPromptLayerCount": 1,
        "rejectedPromptLayerCount": 2,
        "sourceCounts": {
            "builtin": 0,
            "client": 0,
            "mcp": 0,
            "plugin": 0,
            "backend_remote": 0,
        },
    }
    assert capability_apply_event.data == {
        "capabilityRevision": None,
        "acceptedToolCount": 0,
        "acceptedPromptLayerCount": 1,
        "effectiveAvailableToolCount": 0,
        "toolPolicyRebuilt": False,
        "promptBuilderClientToolCount": 0,
        "promptBuilderPromptLayerCount": 1,
    }
    assert session.prompt_builder.client_prompt_layers == [
        {
            "id": "skill.review",
            "type": "extension_skill",
            "priority": 20,
            "content": "Lead with risks.",
            "revision": "rev-1",
            "source_path": "skills/review/SKILL.md",
        }
    ]


@pytest.mark.asyncio
async def test_process_query_extends_existing_allowlist_for_default_plus_client():
    manifest = {
        "version": 1,
        "tools": [
            {
                "name": "cua_driver__list_apps",
                "description": "List apps through CUA.",
                "execution_target": "local_runtime",
                "argument_resolution": "passthrough",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            }
        ],
    }
    session = _build_session(AppConfig(agent_available_tools=["read_file"]))

    events = [
        event
        async for event in session.process_query(
            "check tools",
            agent_definition=AgentDefinition(
                tools={
                    "mode": "default_plus_client",
                    "client_manifest": manifest,
                },
            ),
        )
    ]

    trace_events = [event for event in events if isinstance(event, TraceEvent)]
    apply_event = next(
        event for event in trace_events if event.path == "client_tool_manifest.apply"
    )
    _canonical_schemas, provider_schemas = (
        session.prompt_builder.get_tool_schema_surfaces()
    )
    provider_names = [schema.get("name") for schema in provider_schemas]

    assert apply_event.data["effectiveAvailableToolCount"] == 2
    assert apply_event.data["policyAllowedClientToolCount"] == 1
    assert session.cfg.agent_available_tools == [
        "read_file",
        "cua_driver__list_apps",
    ]
    assert "read_file" in provider_names
    assert "cua_driver__list_apps" in provider_names


@pytest.mark.asyncio
async def test_process_query_replaces_previous_runtime_client_tool_policy():
    session = _build_session()

    first_manifest = {
        "version": 1,
        "tools": [
            {
                "name": "cua_driver__list_apps",
                "description": "List apps through CUA.",
                "execution_target": "local_runtime",
                "argument_resolution": "passthrough",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            }
        ],
    }
    second_manifest = {
        "version": 1,
        "tools": [
            {
                "name": "plugin_tool",
                "description": "Run a plugin tool.",
                "execution_target": "local_runtime",
                "argument_resolution": "passthrough",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            }
        ],
    }

    _ = [
        event
        async for event in session.process_query(
            "first",
            agent_definition=AgentDefinition(
                tools={"mode": "client_only", "client_manifest": first_manifest},
            ),
        )
    ]
    _ = [
        event
        async for event in session.process_query(
            "second",
            agent_definition=AgentDefinition(
                tools={"mode": "client_only", "client_manifest": second_manifest},
            ),
        )
    ]

    _canonical_schemas, provider_schemas = (
        session.prompt_builder.get_tool_schema_surfaces()
    )
    provider_names = [schema.get("name") for schema in provider_schemas]

    assert "plugin_tool" in provider_names
    assert "cua_driver__list_apps" not in provider_names
    assert session.cfg.agent_available_tools == ["plugin_tool"]


@pytest.mark.asyncio
async def test_config_rewire_preserves_runtime_client_tool_policy():
    session = _build_session()
    manifest = {
        "version": 1,
        "tools": [
            {
                "name": "cua_driver__list_apps",
                "description": "List apps through CUA.",
                "execution_target": "local_runtime",
                "argument_resolution": "passthrough",
                "schema": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False,
                },
            }
        ],
    }

    _ = [
        event
        async for event in session.process_query(
            "first",
            agent_definition=AgentDefinition(
                tools={"mode": "client_only", "client_manifest": manifest},
            ),
        )
    ]

    await session.update_config(
        session.cfg.model_copy(update={"selected_model_id": "updated-model"})
    )

    _canonical_schemas, provider_schemas = (
        session.prompt_builder.get_tool_schema_surfaces()
    )
    provider_names = [schema.get("name") for schema in provider_schemas]

    assert "cua_driver__list_apps" in provider_names
