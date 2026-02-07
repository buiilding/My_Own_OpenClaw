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

    def receive_individual_result(
        self,
        request_id: str,
        success: bool,
        result_data: Optional[Dict[str, Any]],
        error: Optional[str],
        metadata: Optional[Dict[str, Any]],
    ) -> ToolResult:
        """
        Receive and convert individual tool result from frontend.
        
        Args:
            request_id: Request ID for the tool result
            success: Whether tool execution succeeded
            result_data: Tool result data
            error: Error message if execution failed
            metadata: Additional metadata
            
        Returns:
            ToolResult object
        """
        # Convert frontend result to ToolResult format
        # Frontend pre-formats messages with system context XML and sets is_preformatted flag
        if metadata is None:
            metadata = {}
        if isinstance(result_data, dict) and result_data.get("is_preformatted"):
            metadata["is_preformatted"] = True
        
        tool_result = ToolResult.from_dict({
            "success": success,
            "data": result_data,
            "error": error,
            "metadata": metadata,
        })
        
        return tool_result

    def receive_bundle_result(
        self,
        bundle_id: str,
        status: str,
        step_results: List[Dict[str, Any]],
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
        # Create bundle result data structure
        bundle_data = {
            "step_results": step_results,
            "screenshot": screenshot,
            "screenshot_ref": screenshot_ref,
            "system_state": system_state,
        }
        
        # Determine overall success
        all_success = status == "success" and all(step.get("status") == "ok" for step in step_results)
        
        # Create ToolResult for the entire bundle
        bundle_result = ToolResult.from_dict({
            "success": all_success,
            "data": bundle_data,
            "error": error,
            "metadata": {
                "is_bundled": True,
                "bundle_id": bundle_id,
            },
        })
        
        return bundle_result

    def receive_bundled_results(
        self,
        bundle_data: Dict[str, Any],
        bundle_request_id: str,
    ) -> tuple[List[tuple[str, ToolResult]], Optional[ToolResult], Optional[str]]:
        """
        Receive and convert bundled tool results from frontend.
        
        Args:
            bundle_data: The data dict from the bundle result
            bundle_request_id: The request_id of the bundle
            
        Returns:
            Tuple of (individual tool results list, combined result if available, bundle screenshot)
        """
        tools = self._normalize_bundle_tools(bundle_data.get("tools"))
        bundle_screenshot = bundle_data.get("screenshot")
        bundle_screenshot_ref = bundle_data.get("screenshot_ref")
        combined_llm_content = bundle_data.get("combined_llm_content")
        
        logger.info(
            f"Receiving bundle result: {len(tools)} tools, "
            f"has_screenshot={bundle_screenshot is not None}, "
            f"has_screenshot_ref={bundle_screenshot_ref is not None}, "
            f"has_combined_content={combined_llm_content is not None}"
        )
        
        if not tools and not combined_llm_content:
            return [], None, bundle_screenshot_ref or bundle_screenshot
        
        tools_success = all(
            t.get("success", False)
            for t in tools
            if isinstance(t, dict)
        )
        
        # Convert individual tool results
        individual_results = []
        for tool_result_data in tools:
            if not isinstance(tool_result_data, dict):
                logger.warning(
                    "Tool result in bundle has invalid type: %s",
                    type(tool_result_data).__name__,
                )
                continue
            tool_request_id = tool_result_data.get("request_id")
            if not tool_request_id:
                logger.warning(f"Tool result in bundle missing request_id: {tool_result_data}")
                continue
            
            tool_name = tool_result_data.get("tool_name", "unknown")
            tool_success = tool_result_data.get("success", False)
            tool_data = tool_result_data.get("data")
            tool_error = tool_result_data.get("error")
            
            # Create ToolResult for this individual tool
            tool_metadata = {}
            if isinstance(tool_data, dict) and tool_data.get("is_preformatted"):
                tool_metadata["is_preformatted"] = True
            
            # Include screenshot in tool result data if present
            if (bundle_screenshot or bundle_screenshot_ref) and isinstance(tool_data, dict):
                tool_data = tool_data.copy()
                if bundle_screenshot:
                    tool_data["screenshot"] = bundle_screenshot
                if bundle_screenshot_ref:
                    tool_data["screenshot_ref"] = bundle_screenshot_ref
            
            tool_result = ToolResult.from_dict({
                "success": tool_success,
                "data": tool_data,
                "error": tool_error,
                "metadata": tool_metadata,
            })
            
            individual_results.append((tool_request_id, tool_result))
        
        # Create combined result if available
        combined_result = None
        if combined_llm_content:
            combined_data = {
                "bundled": True,
                "tool_count": len(tools),
                "screenshot": bundle_screenshot,
                "screenshot_ref": bundle_screenshot_ref,
            }
            
            combined_result = ToolResult.from_dict({
                "success": tools_success,
                "data": combined_data,
                "error": None,
                "metadata": {
                    "is_preformatted": True,
                    "is_bundled": True,
                    "bundle_request_id": bundle_request_id,
                },
                "llm_content": combined_llm_content,
            })
        
        return individual_results, combined_result, bundle_screenshot_ref or bundle_screenshot

    @staticmethod
    def _normalize_bundle_tools(raw_tools: Any) -> List[Any]:
        """Normalize bundled tool payload to a list for safe iteration."""
        if isinstance(raw_tools, list):
            return raw_tools
        if raw_tools is None:
            return []
        logger.warning(
            "Bundle tools payload is not a list (got %s); ignoring invalid value",
            type(raw_tools).__name__,
        )
        return []
