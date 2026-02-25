from types import SimpleNamespace

import pytest

import backend.src.agent.session.initializer as initializer
from backend.src.agent.session.initializer import (
    init_compaction_engine,
    init_event_bus,
    init_executor,
    init_identity,
    init_prompt_and_history,
    init_session_state,
    init_tool_result_handler,
    init_tooling,
    subscribe_events,
)


def test_init_identity_sets_session_id():
    session = SimpleNamespace()
    init_identity(session, "user", None)

    assert session.user_id == "user"
    assert session.session_id


def test_init_session_state_sets_fields():
    session = SimpleNamespace()
    init_session_state(session)

    assert session.runtime.screenshot is not None
    assert session.runtime.resolved_calls is not None
    assert session.runtime.tool_results is not None
    assert session.ocr_completion_event.is_set()


def test_init_event_bus_requires_bus():
    session = SimpleNamespace()
    with pytest.raises(ValueError):
        init_event_bus(session, None)


def test_init_tooling_uses_provided_orchestrator():
    session = SimpleNamespace(cfg=SimpleNamespace())
    registry = object()
    orchestrator = object()

    init_tooling(session, registry, orchestrator)

    assert session.tool_registry is registry
    assert session.tool_orchestrator is orchestrator


def test_init_tooling_creates_default_orchestrator(monkeypatch):
    session = SimpleNamespace(cfg=SimpleNamespace(mode="test"))
    registry = object()
    captured = {}

    class DummyOrchestrator:
        def __init__(self, tool_registry, cfg):
            captured["tool_registry"] = tool_registry
            captured["cfg"] = cfg

    monkeypatch.setattr(
        "backend.src.tools.orchestrator.ToolResultOrchestrator",
        DummyOrchestrator,
    )

    init_tooling(session, registry, None)

    assert session.tool_registry is registry
    assert isinstance(session.tool_orchestrator, DummyOrchestrator)
    assert captured == {"tool_registry": registry, "cfg": session.cfg}


def test_init_prompt_and_history_wires_prompt_builder_system_prompt():
    captured = {}

    class DummyPromptConstructor:
        def __init__(self, tool_registry, cfg, metrics_service=None):
            self.tool_registry = tool_registry
            self.cfg = cfg
            self.metrics_service = metrics_service
            self.system_prompt = "dummy-system-prompt"
            captured["prompt_args"] = (tool_registry, cfg, metrics_service)

    class DummyHistory:
        def __init__(self, max_length, system_prompt):
            self.max_length = max_length
            self.system_prompt = system_prompt
            captured["history_args"] = (max_length, system_prompt)

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(initializer, "PromptConstructor", DummyPromptConstructor)
    monkeypatch.setattr(initializer, "ConversationHistory", DummyHistory)

    session = SimpleNamespace(
        tool_registry=object(),
        cfg=SimpleNamespace(max_history_length=123),
    )
    metrics_service = object()

    try:
        init_prompt_and_history(session, metrics_service=metrics_service)
    finally:
        monkeypatch.undo()

    assert session.prompt_builder.metrics_service is metrics_service
    assert session.history.max_length == 123
    assert session.history.system_prompt == session.prompt_builder.system_prompt
    assert captured["prompt_args"] == (
        session.tool_registry,
        session.cfg,
        metrics_service,
    )
    assert captured["history_args"] == (123, "dummy-system-prompt")


def test_init_executor_passes_expected_dependencies(monkeypatch):
    captured = {}

    class DummyExecutor:
        def __init__(
            self,
            session,
            llm_client,
            tool_orchestrator,
            prompt_constructor,
            ocr_service,
            event_bus,
        ):
            captured.update(
                {
                    "session": session,
                    "llm_client": llm_client,
                    "tool_orchestrator": tool_orchestrator,
                    "prompt_constructor": prompt_constructor,
                    "ocr_service": ocr_service,
                    "event_bus": event_bus,
                }
            )

    monkeypatch.setattr(initializer, "AgentExecutor", DummyExecutor)

    session = SimpleNamespace(
        llm_client=object(),
        tool_orchestrator=object(),
        prompt_builder=object(),
        event_bus=object(),
    )
    ocr_service = object()

    init_executor(session, ocr_service)

    assert isinstance(session.executor, DummyExecutor)
    assert captured["session"] is session
    assert captured["ocr_service"] is ocr_service
    assert captured["llm_client"] is session.llm_client
    assert captured["tool_orchestrator"] is session.tool_orchestrator
    assert captured["prompt_constructor"] is session.prompt_builder
    assert captured["event_bus"] is session.event_bus


def test_init_compaction_engine_wires_session(monkeypatch):
    captured = {}

    class DummyCompactionEngine:
        def __init__(self, session):
            captured["session"] = session

    monkeypatch.setattr(initializer, "CompactionEngine", DummyCompactionEngine)
    session = SimpleNamespace()

    init_compaction_engine(session)

    assert isinstance(session.compaction_engine, DummyCompactionEngine)
    assert captured["session"] is session


def test_subscribe_events_registers_interaction_completed_handler():
    bus = SimpleNamespace(calls=[])

    def subscribe(event_type, handler):
        bus.calls.append((event_type, handler))

    bus.subscribe = subscribe
    callback = object()
    session = SimpleNamespace(event_bus=bus, _on_interaction_completed=callback)

    subscribe_events(session)

    assert len(bus.calls) == 1
    event_type, handler = bus.calls[0]
    assert event_type is initializer.InteractionCompleted
    assert handler is callback


def test_init_tool_result_handler_wires_dependencies_and_initializes_runtime(
    monkeypatch,
):
    captured = {}

    class DummyToolResultReceiver:
        def __init__(self, session):
            self.session = session
            captured["receiver_session"] = session

    class DummyScreenshotProcessor:
        def __init__(self, screenshot_manager):
            self.screenshot_manager = screenshot_manager
            captured["screenshot_manager"] = screenshot_manager

    class DummyToolResultRouter:
        def __init__(self, receiver, screenshot_processor, result_storage, session):
            captured["router_receiver"] = receiver
            captured["router_screenshot_processor"] = screenshot_processor
            captured["router_result_storage"] = result_storage
            captured["router_session"] = session

    class DummyToolResultHandler:
        def __init__(self, receiver, router):
            self.receiver = receiver
            self.router = router

    monkeypatch.setattr(
        "backend.src.agent.tools.waiting.ToolResultReceiver",
        DummyToolResultReceiver,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.preparation.screenshot.ScreenshotProcessor",
        DummyScreenshotProcessor,
    )
    monkeypatch.setattr(
        "backend.src.agent.tools.waiting.ToolResultRouter",
        DummyToolResultRouter,
    )
    monkeypatch.setattr(initializer, "ToolResultHandler", DummyToolResultHandler)

    session = SimpleNamespace(
        executor=SimpleNamespace(screenshot_manager=object()),
    )

    init_tool_result_handler(session)

    assert session.runtime is not None
    assert captured["receiver_session"] is session
    assert captured["screenshot_manager"] is session.executor.screenshot_manager
    assert captured["router_session"] is session
    assert captured["router_result_storage"] is session.runtime.tool_results
    assert isinstance(session.tool_result_handler, DummyToolResultHandler)
