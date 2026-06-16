"""
System Stats Tool - Python implementation using psutil.
"""

import logging
from typing import Dict, Any

from core.system_metrics import collect_system_stats
from tools.result import ToolResult

logger = logging.getLogger(__name__)


async def get_system_stats(args: Dict[str, Any]) -> ToolResult:
    """
    Get system statistics.
    
    Args:
        args: Dictionary (unused, but kept for interface consistency)
        
    Returns:
        ToolResult with system stats data
    """
    try:
        stats = await collect_system_stats()
        
        import json
        content = json.dumps(stats, indent=2)
        
        return ToolResult.success_result(
            {
                "stats": stats,
                "output": content,
            }
        )
    except ImportError:
        logger.error("psutil not available, cannot get system stats")
        return ToolResult.error_result("psutil library not available")
    except Exception as e:
        logger.error(f"Error getting system stats: {e}", exc_info=True)
        return ToolResult.error_result(f"Failed to get system stats: {str(e)}")
