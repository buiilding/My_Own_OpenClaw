"""
Screenshot Tool - Python implementation using pyautogui and PIL.
"""

import asyncio
import base64
import io
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


async def capture_screenshot(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Capture screenshot.
    
    Args:
        args: Dictionary (unused, but kept for interface consistency)
        
    Returns:
        Dictionary with success status and screenshot data (base64 PNG)
    """
    try:
        import pyautogui
        from PIL import Image
        
        def _capture():
            # Capture screenshot
            screenshot = pyautogui.screenshot()
            
            # Convert to PNG bytes
            img_buffer = io.BytesIO()
            screenshot.save(img_buffer, format="PNG")
            img_bytes = img_buffer.getvalue()
            
            # Encode to base64
            base64_data = base64.b64encode(img_bytes).decode("utf-8")
            
            return base64_data
        
        loop = asyncio.get_event_loop()
        base64_data = await loop.run_in_executor(None, _capture)
        
        # Calculate approximate size (base64 is ~33% larger than binary)
        size = int(len(base64_data) * 0.75)
        
        return {
            "success": True,
            "data": {
                "screenshot": base64_data,
                "compression": "png",
                "size": size,
                "llm_content": "Screenshot captured successfully.",
                "return_display": "Screenshot captured",
            },
        }
    except ImportError as e:
        logger.error(f"Required library not available: {e}")
        return {"success": False, "error": f"Required library not available: {str(e)}"}
    except Exception as e:
        logger.error(f"Screenshot failed: {e}", exc_info=True)
        return {"success": False, "error": f"Screenshot failed: {str(e)}"}
