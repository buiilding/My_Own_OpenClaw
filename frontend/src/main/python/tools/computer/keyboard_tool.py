"""
Keyboard Control Tool - Python implementation using pyautogui and pynput.
"""

import asyncio
import logging
from typing import Dict, Any, List

from core.executors import get_interactive_executor

logger = logging.getLogger(__name__)

# Key mapping for special keys
KEY_MAP = {
    "enter": "enter",
    "tab": "tab",
    "space": "space",
    "backspace": "backspace",
    "delete": "delete",
    "escape": "esc",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "home": "home",
    "end": "end",
    "pageup": "pageup",
    "pagedown": "pagedown",
    "f1": "f1",
    "f2": "f2",
    "f3": "f3",
    "f4": "f4",
    "f5": "f5",
    "f6": "f6",
    "f7": "f7",
    "f8": "f8",
    "f9": "f9",
    "f10": "f10",
    "f11": "f11",
    "f12": "f12",
}


async def execute_keyboard_control(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute keyboard control action.
    
    Args:
        args: Dictionary with 'action', 'text', 'key', 'keys'
        
    Returns:
        Dictionary with success status and action result
    """
    action = args.get("action")
    
    if not action:
        return {"success": False, "error": "action is required"}
    
    try:
        import pyautogui
        
        # Disable pyautogui failsafe
        pyautogui.FAILSAFE = False
        
        def _execute_action():
            if action == "type":
                text = args.get("text")
                if not text:
                    raise ValueError("text parameter required for type action")
                if len(text) > 10000:
                    raise ValueError(f"Text too long: {len(text)} characters (max 10000)")
                
                pyautogui.write(text, interval=0.01)
                
                return {
                    "action": "type",
                    "input": text[:50] + "..." if len(text) > 50 else text,
                    "message": f"Typed text: '{text}'",
                    "llm_content": f"Typed text: '{text}'",
                    "return_display": f"Typed text: '{text}'",
                    "metadata": {
                        "action": "type",
                        "input_type": "text",
                        "input_length": len(text),
                    },
                }
            
            elif action == "press":
                key = args.get("key")
                if not key:
                    raise ValueError("key parameter required for press action")
                
                # Map key string to pyautogui key name
                key_name = KEY_MAP.get(key.lower(), key.lower())
                pyautogui.press(key_name)
                
                return {
                    "action": "press",
                    "input": key,
                    "message": f"Pressed key: {key}",
                    "llm_content": f"Pressed key: {key}",
                    "return_display": f"Pressed key: {key}",
                    "metadata": {
                        "action": "press",
                        "input_type": "key",
                        "input_length": 1,
                    },
                }
            
            elif action == "hotkey":
                keys = args.get("keys")
                if not keys or len(keys) == 0:
                    raise ValueError("keys parameter required for hotkey action")
                
                # Block dangerous key combinations
                dangerous_combos = [
                    ["alt", "f4"],
                    ["ctrl", "alt", "del"],
                    ["ctrl", "shift", "esc"],
                ]
                keys_lower = [k.lower() for k in keys]
                for combo in dangerous_combos:
                    if all(k in keys_lower for k in combo):
                        raise ValueError(f"Dangerous key combination blocked: {' + '.join(combo)}")
                
                # Map keys to pyautogui key names
                mapped_keys = [KEY_MAP.get(k.lower(), k.lower()) for k in keys]
                pyautogui.hotkey(*mapped_keys)
                
                return {
                    "action": "hotkey",
                    "input": " + ".join(keys),
                    "message": f"Pressed hotkey: {' + '.join(keys)}",
                    "llm_content": f"Pressed hotkey: {' + '.join(keys)}",
                    "return_display": f"Pressed hotkey: {' + '.join(keys)}",
                    "metadata": {
                        "action": "hotkey",
                        "input_type": "keys",
                        "input_length": len(keys),
                    },
                }
            
            else:
                raise ValueError(f"Unknown keyboard action: {action}")
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(get_interactive_executor(), _execute_action)
        
        return {
            "success": True,
            "data": result,
        }
    except ImportError:
        logger.error("pyautogui not available, cannot execute keyboard control")
        return {"success": False, "error": "pyautogui library not available"}
    except Exception as e:
        logger.error(f"Keyboard action failed: {e}", exc_info=True)
        return {"success": False, "error": f"Keyboard action failed: {str(e)}"}
