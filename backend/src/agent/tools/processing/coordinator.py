"""
Tool processing coordinator.

Coordinates result processing only.
"""
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.processing.processor import ToolResultProcessor
    from backend.src.tools.result_types import ToolExecutionBatch

logger = logging.getLogger(__name__)


class ToolProcessingCoordinator:
    """
    Coordinates tool result processing.
    
    Responsibility: Processing coordination only.
    Delegates actual processing to ToolResultProcessor.
    """

    def __init__(
        self,
        processor: "ToolResultProcessor",
    ):
        """
        Initialize the tool processing coordinator.
        
        Args:
            processor: Processor for result processing
        """
        self.processor = processor

    async def process(
        self, orchestration_result: "ToolExecutionBatch", session: "AgentSession"
    ) -> None:
        """
        Coordinate result processing.
        
        Args:
            orchestration_result: Result from tool orchestrator with tool results
            session: Agent session for context
        """
        await self.processor.process(orchestration_result, session)
