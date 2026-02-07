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
    
    async def process_frontend_tool_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
        metadata: Dict[str, Any]
    ) -> None:
        """
        Process a tool result from the frontend.
        
        Public entry point that delegates to receiver and router.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data (may contain bundled flag)
            error: Error message if execution failed
            metadata: Additional metadata
        """
        # Route to appropriate handler based on result type
        if isinstance(result_data, dict) and result_data.get("bundled"):
            # Handle bundled results
            individual_results, combined_result, bundle_screenshot = self.receiver.receive_bundled_results(
                result_data, request_id
            )
            await self.router.route_bundled_results(
                request_id, individual_results, combined_result, bundle_screenshot
            )
            return
        
        # Handle individual tool result
        tool_result = self.receiver.receive_individual_result(
            request_id, success, result_data, error, metadata
        )
        await self.router.route_individual_result(request_id, tool_result)
    
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
        await self.router.route_bundle_result(bundle_id, bundle_result)
