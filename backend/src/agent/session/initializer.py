"""AgentSession initialization helpers."""
from typing import Any, Optional

from backend.src.agent.execution.executor import AgentExecutor
from backend.src.agent.compaction import CompactionEngine
from backend.src.agent.session.runtime_state import SessionRuntimeState
from backend.src.agent.session.state import ConversationHistory
from backend.src.agent.tools.waiting import ToolResultHandler
from backend.src.core.infrastructure.bus import EventBus
from backend.src.core.events.bus_events import InteractionCompleted
from backend.src.llm.prompts import PromptConstructor
from backend.src.tools.registry import ToolRegistry


def init_tooling(
    session,
    tool_registry: ToolRegistry,
    tool_orchestrator,
) -> None:
    session.tool_registry = tool_registry
    if tool_orchestrator is None:
        from backend.src.tools.orchestrator import ToolResultOrchestrator

        session.tool_orchestrator = ToolResultOrchestrator(
            session.tool_registry, session.cfg
        )
    else:
        session.tool_orchestrator = tool_orchestrator


def init_prompt_and_history(session, metrics_service: Optional[Any]) -> None:
    session.prompt_builder = PromptConstructor(
        session.tool_registry, session.cfg, metrics_service=metrics_service
    )
    session.history = ConversationHistory(
        max_length=session.cfg.max_history_length,
        system_prompt=session.prompt_builder.system_prompt,
    )


def init_identity(session, user_id: str, session_id: Optional[str]) -> None:
    import uuid

    session.user_id = user_id
    session.session_id = session_id or str(uuid.uuid4())


def init_event_bus(session, event_bus: Optional[EventBus]) -> None:
    if event_bus is None:
        raise ValueError("event_bus is required for AgentSession")
    session.event_bus = event_bus


def init_executor(session, ocr_service) -> None:
    session.executor = AgentExecutor(
        session=session,
        llm_client=session.llm_client,
        tool_orchestrator=session.tool_orchestrator,
        prompt_constructor=session.prompt_builder,
        ocr_service=ocr_service,
        event_bus=session.event_bus,
    )


def init_compaction_engine(session) -> None:
    """Initialize per-session history compaction engine."""
    session.compaction_engine = CompactionEngine(session)


def subscribe_events(session) -> None:
    session.event_bus.subscribe(InteractionCompleted, session._on_interaction_completed)


def init_session_state(session) -> None:
    session.runtime = SessionRuntimeState()

    session.ocr_completion_event = session.runtime.ocr_completion_event


def init_tool_result_handler(session) -> None:
    """Initialize tool result routing and storage."""
    from backend.src.agent.tools.preparation.screenshot import (
        ScreenshotProcessor,
    )
    from backend.src.agent.tools.waiting import ToolResultReceiver, ToolResultRouter
    if not hasattr(session, "runtime"):
        init_session_state(session)

    tool_result_receiver = ToolResultReceiver(session)
    screenshot_processor = ScreenshotProcessor(session.executor.screenshot_manager)
    tool_result_router = ToolResultRouter(
        receiver=tool_result_receiver,
        screenshot_processor=screenshot_processor,
        result_storage=session.runtime.tool_results,
        session=session,
    )
    session.tool_result_handler = ToolResultHandler(
        receiver=tool_result_receiver,
        router=tool_result_router,
    )
