"""
Tool Result Handler.

Facade for tool result processing from the frontend.
Uses receiver and router for separation of concerns.
"""
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.screenshot.processor import ScreenshotProcessor
    from backend.src.agent.tools.waiting.receiver import ToolResultReceiver
    from backend.src.agent.tools.waiting.router import ToolResultRouter
    from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage

logger = logging.getLogger(__name__)


class ToolResultHandler:
    """
    Handles tool result processing from the frontend.
    
    Responsibility: Facade for receiving and routing results.
    Delegates to ToolResultReceiver and ToolResultRouter.
    """
    
    def __init__(
        self,
        receiver: "ToolResultReceiver",
        router: "ToolResultRouter",
    ):
        """
        Initialize the tool result handler.
        
        Args:
            receiver: Receiver for converting frontend results
            router: Router for routing results to handlers
        """
        self.receiver = receiver
        self.router = router

    async def _route_single_or_bundle_result(
        self,
        correlation_id: str,
        tool_result: "ToolResult",
        *,
        is_bundle: bool,
    ) -> None:
        """
        Route a normalized ToolResult via the unified router path.

        Keeps a single execution path for individual and atomic bundle results.
        """
        route_mode = "bundle" if is_bundle else "individual"
        await self.router.route_result(
            correlation_id,
            tool_result,
            route_mode=route_mode,
        )
    
    async def process_frontend_tool_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
    ) -> None:
        """
        Process a tool result from the frontend.
        
        Public entry point that delegates to receiver and router.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data
            error: Error message if execution failed
        """
        # tool-result messages are always individual.
        tool_result = self.receiver.receive_individual_result(
            request_id, success, result_data, error
        )
        await self._route_single_or_bundle_result(
            request_id,
            tool_result,
            is_bundle=False,
        )
    
    async def process_frontend_tool_bundle_result(
        self,
        bundle_id: str,
        status: str,
        step_results: List[Dict[str, Any]],
        screenshot: Optional[str],
        screenshot_ref: Optional[str],
        system_state: Optional[Dict[str, Any]],
        error: Optional[str]
    ) -> None:
        """
        Process an atomic tool-bundle-result from the frontend.
        
        Args:
            bundle_id: Bundle ID for the bundle result
            status: Bundle status ("success", "partial_failure", "failure")
            step_results: List of step results with tool, status, output
            screenshot: Optional screenshot captured after bundle execution
            system_state: Optional system state captured after bundle execution
            error: Optional error message if bundle failed
        """
        # Receive bundle result
        bundle_result = self.receiver.receive_bundle_result(
            bundle_id, status, step_results, screenshot, screenshot_ref, system_state, error
        )
        
        # Route bundle result
        await self._route_single_or_bundle_result(
            bundle_id,
            bundle_result,
            is_bundle=True,
        )
