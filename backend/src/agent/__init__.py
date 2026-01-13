"""Agent domain package."""

# Core agent state and execution
from backend.src.agent.core import (
    AgentExecutor,
    AgentSession,
    ConversationHistory,
    InteractionLoop,
    SessionManager,
)

# LLM interaction, prompts, and event presentation
from backend.src.agent.llm import (
    EventPresenter,
    LLMInteractionHandler,
    PromptCoordinator,
)

# Tool orchestration and preparation
from backend.src.agent.tools import (
    CoordinateResolver,
    OcrCoordinator,
    OcrResolver,
    ResultTransformer,
    ScreenshotManager,
    SyntheticResultFactory,
    ToolExecutor,
    ToolPreparer,
    VisionResolver,
    VisionServiceProvider,
)

# Agent memory and state mutation
from backend.src.agent.history import HistoryCommitter

__all__ = [
    # Core
    "AgentExecutor",
    "AgentSession",
    "ConversationHistory",
    "InteractionLoop",
    "SessionManager",
    # LLM
    "EventPresenter",
    "LLMInteractionHandler",
    "PromptCoordinator",
    # Tools
    "CoordinateResolver",
    "OcrCoordinator",
    "OcrResolver",
    "ResultTransformer",
    "ScreenshotManager",
    "SyntheticResultFactory",
    "ToolExecutor",
    "ToolPreparer",
    "VisionResolver",
    "VisionServiceProvider",
    # History
    "HistoryCommitter",
]
