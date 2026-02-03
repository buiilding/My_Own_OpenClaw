"""Tool orchestration and lifecycle."""

# High-level orchestrator
from backend.src.agent.tools.orchestrator import ToolOrchestrator

# Resolution phase
from backend.src.agent.tools.preparation.coordinate_resolution import (
    CoordinateResolver,
    OcrCoordinateResolver,
    VisionCoordinateResolver,
)
from backend.src.agent.tools.preparation.helpers import VisionServiceProvider
from backend.src.agent.tools.preparation.ocr import OcrCoordinator
from backend.src.agent.tools.preparation.screenshot import ScreenshotManager
from backend.src.agent.tools.preparation.storage import ResolvedToolCallStorage

# Preparation phase
from backend.src.agent.tools.preparation import ResolvedToolCall, ToolPreparer

# Sending phase
from backend.src.agent.tools.sending import ToolSender

# Waiting phase
from backend.src.agent.tools.waiting import (
    ToolResultHandler,
    ToolResultReceiver,
    ToolResultRouter,
)
from backend.src.agent.tools.waiting.storage import ToolResultStorage

# Processing phase
from backend.src.agent.tools.processing import (
    ResultTransformer,
    SyntheticResultFactory,
    ToolProcessingCoordinator,
    ToolResultProcessor,
)

# Shared utilities
from backend.src.agent.tools.shared import (
    BundleResultFormatter,
    is_atomic_bundle,
    is_atomic_bundle_from_results,
    short_id,
)

__all__ = [
    # Orchestrator
    "ToolOrchestrator",
    # Preparation
    "ResolvedToolCall",
    "ToolPreparer",
    "CoordinateResolver",
    "OcrCoordinateResolver",
    "VisionCoordinateResolver",
    "OcrCoordinator",
    "ScreenshotManager",
    "ResolvedToolCallStorage",
    "VisionServiceProvider",
    # Sending
    "ToolSender",
    # Waiting
    "ToolResultHandler",
    "ToolResultReceiver",
    "ToolResultRouter",
    "ToolResultStorage",
    # Processing
    "ToolProcessingCoordinator",
    "ToolResultProcessor",
    "ResultTransformer",
    "SyntheticResultFactory",
    # Shared
    "BundleResultFormatter",
    "is_atomic_bundle",
    "is_atomic_bundle_from_results",
    "short_id",
]
