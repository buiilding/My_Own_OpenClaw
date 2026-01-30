"""
System Stats Tool - Python implementation using psutil.
"""

import asyncio
import logging
from typing import Dict, Any, Optional

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
        import psutil
        
        def _get_stats():
            cpu_percent = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            try:
                battery = psutil.sensors_battery()
                battery_percent = battery.percent if battery else None
                battery_charging = battery.power_plugged if battery else None
            except (AttributeError, NotImplementedError):
                # Battery info not available on all systems
                battery_percent = None
                battery_charging = None
            
            return {
                "cpu_percent": cpu_percent,
                "memory_percent": mem.percent,
                "battery_percent": battery_percent,
                "battery_charging": battery_charging,
            }
        
        loop = asyncio.get_event_loop()
        stats = await loop.run_in_executor(None, _get_stats)
        
        import json
        content = json.dumps(stats, indent=2)
        
        return {
            "success": True,
            "data": {
                "stats": stats,
                "llm_content": content,
            },
        }
    except ImportError:
        logger.error("psutil not available, cannot get system stats")
        return {"success": False, "error": "psutil library not available"}
    except Exception as e:
        logger.error(f"Error getting system stats: {e}", exc_info=True)
        return {"success": False, "error": f"Failed to get system stats: {str(e)}"}
