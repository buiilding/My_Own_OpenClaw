"""
Wait Tool - Python implementation.
"""

import logging
from typing import Dict, Any

from tools.result import ToolResult

logger = logging.getLogger(__name__)


async def wait(args: Dict[str, Any]) -> ToolResult:
    """
    Wait tool - returns immediately without blocking.
    
    The actual wait delay is handled by the SDK local-runtime coordinator, which
    delays post-action screenshot/system-state capture by the specified seconds.
    This ensures the Python local-runtime tool doesn't block other operations.
    
    Args:
        args: Dictionary with required 'seconds' parameter
        
    Returns:
        ToolResult with wait result data (returns immediately)
    """
    try:
        if "seconds" not in args:
            return ToolResult.error_result("seconds is required")

        seconds = args.get("seconds")
        
        # Validate seconds is a positive number
        if not isinstance(seconds, (int, float)) or seconds < 0:
            return ToolResult.error_result("seconds must be a non-negative number")
        
        # Return immediately; the SDK local-runtime coordinator delays
        # screenshot/system-state capture without blocking sidecar operations.
        seconds_float = float(seconds)
        
        # Format message based on seconds value
        if seconds_float == 1.0:
            status_msg = "Waited for 1 second"
        else:
            status_msg = f"Waited for {seconds_float} seconds"
        
        return ToolResult.success_result(
            {
                "seconds_waited": seconds_float,
                "status": status_msg,
                "output": f"status: {status_msg}",
                "message": status_msg,
            }
        )
    except Exception as e:
        logger.error(f"Error in wait operation: {e}", exc_info=True)
        return ToolResult.error_result(f"Wait operation failed: {str(e)}")
