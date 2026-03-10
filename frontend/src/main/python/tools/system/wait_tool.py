"""
Wait Tool - Python implementation.
"""

import asyncio
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


async def wait(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Wait tool - returns immediately without blocking.
    
    The actual wait delay is handled by the frontend, which delays screenshot/system state
    capture by the specified seconds. This ensures the wait doesn't block other operations.
    
    Args:
        args: Dictionary with required 'seconds' parameter
        
    Returns:
        Dictionary with success status and wait result (returns immediately)
    """
    try:
        if "seconds" not in args:
            return {"success": False, "error": "seconds is required"}

        seconds = args.get("seconds")
        
        # Validate seconds is a positive number
        if not isinstance(seconds, (int, float)) or seconds < 0:
            return {"success": False, "error": "seconds must be a non-negative number"}
        
        # Return immediately - the frontend will delay screenshot/system state capture
        # This ensures the wait doesn't block other operations
        seconds_float = float(seconds)
        
        # Format message based on seconds value
        if seconds_float == 1.0:
            status_msg = "Waited for 1 second"
        else:
            status_msg = f"Waited for {seconds_float} seconds"
        
        return {
            "success": True,
            "data": {
                "seconds_waited": seconds_float,
                "status": status_msg,
                "llm_content": f"status: {status_msg}",
                "return_display": status_msg,
            },
        }
    except Exception as e:
        logger.error(f"Error in wait operation: {e}", exc_info=True)
        return {"success": False, "error": f"Wait operation failed: {str(e)}"}
