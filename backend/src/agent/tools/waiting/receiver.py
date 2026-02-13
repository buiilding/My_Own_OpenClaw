"""
Tool result receiver.

Receives tool results from frontend and converts to ToolResult format.
"""

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from backend.src.core.interfaces.tool import ToolResult

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

logger = logging.getLogger(__name__)


class ToolResultReceiver:
    """
    Receives tool results from frontend.

    Responsibility: Receiving and converting results only.
    Converts frontend format to ToolResult format.
    """

    def __init__(self, session: "AgentSession"):
        """
        Initialize the tool result receiver.

        Args:
            session: Agent session for state access
        """
        self.session = session

    @staticmethod
    def _normalize_step_result(step: Any) -> Dict[str, Any]:
        """Normalize one bundle step to a plain dict."""
        if isinstance(step, dict):
            return dict(step)
        model_dump = getattr(step, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump()
            if isinstance(dumped, dict):
                return dumped
        return {}

    def receive_individual_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
    ) -> ToolResult:
        """
        Receive and convert individual tool result from frontend.

        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data
            error: Error message if execution failed

        Returns:
            ToolResult object
        """
        tool_result = ToolResult.from_dict(
            {
                "success": success,
                "data": result_data,
                "error": error,
            }
        )

        return tool_result

    def receive_bundle_result(
        self,
        bundle_id: str,
        status: str,
        step_results: List[Any],
        screenshot: Optional[str],
        screenshot_ref: Optional[str],
        system_state: Optional[Dict[str, Any]],
        error: Optional[str],
    ) -> ToolResult:
        """
        Receive and convert atomic bundle result from frontend.

        Args:
            bundle_id: Bundle ID for the bundle result
            status: Bundle status ("success", "partial_failure", "failure")
            step_results: List of step results with tool, status, output
            screenshot: Optional screenshot captured after bundle execution
            system_state: Optional system state captured after bundle execution
            error: Optional error message if bundle failed

        Returns:
            ToolResult object for the bundle
        """
        normalized_step_results = [
            self._normalize_step_result(step) for step in step_results
        ]

        # Create bundle result data structure
        bundle_data = {
            "step_results": normalized_step_results,
            "screenshot": screenshot,
            "screenshot_ref": screenshot_ref,
            "system_state": system_state,
        }

        # Determine overall success
        all_success = status == "success" and all(
            step.get("status") == "ok" for step in normalized_step_results
        )

        # Create ToolResult for the entire bundle
        bundle_result = ToolResult.from_dict(
            {
                "success": all_success,
                "data": bundle_data,
                "error": error,
                "metadata": {
                    "is_bundled": True,
                    "bundle_id": bundle_id,
                },
            }
        )

        return bundle_result
