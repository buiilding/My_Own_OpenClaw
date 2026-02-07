"""
Bundle Result Formatter.

Converts atomic bundle results into a single cohesive narrative for LLM history.
This eliminates redundant XML blocks and provides cleaner context.
"""
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class BundleResultFormatter:
    """
    Formats bundle execution results into a single narrative for LLM history.
    
    Converts step_results into a cohesive story instead of multiple
    separate tool_result XML blocks.
    """
    
    @staticmethod
    def format(
        bundle_result: Dict[str, Any],
        system_state: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Format bundle result into single narrative for LLM history.
        
        Args:
            bundle_result: Bundle result dictionary with:
                - bundle_id: str
                - status: str ("success", "partial_failure", "failure")
                - step_results: List[Dict] with tool, status, output
                - screenshot: Optional[str]
                - system_state: Optional[Dict]
                - error: Optional[str]
            system_state: Optional system state dict (if not in bundle_result)
            
        Returns:
            Formatted string with system context XML and narrative
        """
        status = bundle_result.get("status", "unknown")
        step_results = bundle_result.get("step_results", [])
        error = bundle_result.get("error")
        screenshot = bundle_result.get("screenshot")
        screenshot_ref = bundle_result.get("screenshot_ref")
        sys_state = bundle_result.get("system_state") or system_state
        
        # Build narrative
        parts = []
        
        if status == "success":
            parts.append("Bundled tool sequence executed successfully:")
        elif status == "partial_failure":
            parts.append("Bundled tool sequence executed with partial failures:")
        else:  # failure
            parts.append("Bundled tool sequence failed:")
        
        # Add step-by-step narrative
        for i, step in enumerate(step_results, 1):
            tool_name = step.get("tool", "unknown")
            step_status = step.get("status", "unknown")
            output = step.get("output", "")
            
            if step_status == "ok":
                parts.append(f"{i}. {tool_name}: {output}")
            else:
                parts.append(f"{i}. {tool_name}: FAILED - {output}")
        
        # Add error if present
        if error:
            parts.append(f"Error: {error}")
        
        # Add system state XML
        if sys_state:
            parts.append("\n" + _format_system_state_xml(sys_state))
        
        # Add screenshot indicator
        if screenshot or screenshot_ref:
            parts.append("\n[Screenshot captured after bundle execution]")
        
        return "\n".join(parts)


def _format_system_state_xml(system_state: Dict[str, Any]) -> str:
    """
    Format system state as XML for LLM context.
    
    Args:
        system_state: System state dictionary
        
    Returns:
        XML formatted string
    """
    active_window = system_state.get("active_window", "Unknown")
    mouse_position = system_state.get("mouse_position", {})
    mouse_x = mouse_position.get("x", 0) if isinstance(mouse_position, dict) else 0
    mouse_y = mouse_position.get("y", 0) if isinstance(mouse_position, dict) else 0
    time_str = system_state.get("time", "Unknown")
    
    return f"""<os_state>
<active_window>{active_window}</active_window>
<mouse_position>
  <x>{mouse_x}</x>
  <y>{mouse_y}</y>
</mouse_position>
<time>{time_str}</time>
</os_state>"""
