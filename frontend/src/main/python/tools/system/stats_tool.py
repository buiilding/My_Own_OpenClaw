"""
System Stats Tool - Python implementation using psutil.
"""

import logging
from typing import Dict, Any

from core.system_metrics import collect_system_stats

logger = logging.getLogger(__name__)


async def get_system_stats(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get system statistics.
    
    Args:
        args: Dictionary (unused, but kept for interface consistency)
        
    Returns:
        Dictionary with success status and system stats
    """
    try:
        stats = await collect_system_stats()
        
        import json
        content = json.dumps(stats, indent=2)
        
        return {
            "success": True,
            "data": {
                "stats": stats,
                "output": content,
            },
        }
    except ImportError:
        logger.error("psutil not available, cannot get system stats")
        return {"success": False, "error": "psutil library not available"}
    except Exception as e:
        logger.error(f"Error getting system stats: {e}", exc_info=True)
        return {"success": False, "error": f"Failed to get system stats: {str(e)}"}
