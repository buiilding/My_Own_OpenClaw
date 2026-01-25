"""Agent domain package."""

# Session management
from backend.src.agent.session import (
    AgentSession,
    ConversationHistory,
    SessionManager,
)

# Execution orchestration
from backend.src.agent.execution import (
    AgentExecutor,
    InteractionLoop,
)

# LLM interaction
from backend.src.agent.llm import (
    ConversationContext,
    EventPresenter,
    LLMStreamProcessor,
)

# Tool orchestration and lifecycle
from backend.src.agent.tools import (
    CoordinateResolver,
    OcrCoordinateResolver,
    OcrCoordinator,
    ResultTransformer,
    ScreenshotManager,
    SyntheticResultFactory,
    ToolOrchestrator,
    ToolResolver,
    ToolProcessingCoordinator,
    ToolResultHandler,
    VisionCoordinateResolver,
    VisionServiceProvider,
)

# Agent memory and state mutation
from backend.src.agent.history import HistoryCommitter

__all__ = [
    # Session
    "AgentSession",
    "ConversationHistory",
    "SessionManager",
    # Execution
    "AgentExecutor",
    "InteractionLoop",
    # LLM
    "ConversationContext",
    "EventPresenter",
    "LLMStreamProcessor",
    # Tools
    "CoordinateResolver",
    "OcrCoordinateResolver",
    "OcrCoordinator",
    "ResultTransformer",
    "ScreenshotManager",
    "SyntheticResultFactory",
    "ToolOrchestrator",
    "ToolResolver",
    "ToolProcessingCoordinator",
    "ToolResultHandler",
    "VisionCoordinateResolver",
    "VisionServiceProvider",
    # History
    "HistoryCommitter",
]
