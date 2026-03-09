"""Keyboard Control Tool - Python implementation using pyautogui."""

import asyncio
import logging
import platform
from typing import Any, Dict

from core.executors import get_interactive_executor

logger = logging.getLogger(__name__)
_MAX_TEXT_LENGTH = 10000
_AUTO_PASTE_THRESHOLD = 120
_CLIPBOARD_NOT_CAPTURED = object()

# Key mapping for special keys
COMMON_KEY_MAP = {
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

PLATFORM_KEY_ALIASES = {
    "Darwin": {
        "super": "command",
        "meta": "command",
        "win": "command",
        "cmd": "command",
    },
    "Windows": {
        "super": "win",
        "meta": "win",
    },
    "Linux": {
        "super": "win",
        "meta": "win",
    },
}


def _normalize_key_name(raw_key: str) -> str:
    normalized_key = raw_key.lower()
    platform_aliases = PLATFORM_KEY_ALIASES.get(platform.system(), {})
    if normalized_key in platform_aliases:
        return platform_aliases[normalized_key]
    return COMMON_KEY_MAP.get(normalized_key, normalized_key)


def _normalize_hotkey_keys(raw_keys: list[str]) -> list[str]:
    return [_normalize_key_name(key) for key in raw_keys]


def _get_paste_modifier_key() -> str:
    return "command" if platform.system() == "Darwin" else "ctrl"


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

        def _get_text_input() -> str:
            text = args.get("text")
            if not text:
                raise ValueError("text parameter required for type or paste action")
            if len(text) > _MAX_TEXT_LENGTH:
                raise ValueError(f"Text too long: {len(text)} characters (max {_MAX_TEXT_LENGTH})")
            return text

        def _paste_text(text: str) -> Dict[str, Any]:
            try:
                import pyperclip
            except Exception as exc:
                raise ImportError("pyperclip library not available") from exc

            if not hasattr(pyperclip, "copy") or not hasattr(pyperclip, "paste"):
                raise ImportError("pyperclip library not available")

            restore_clipboard = _CLIPBOARD_NOT_CAPTURED
            try:
                restore_clipboard = pyperclip.paste()
            except Exception as exc:
                logger.warning(
                    "Failed to capture clipboard before paste; skipping restore: %s",
                    exc,
                )

            pyperclip.copy(text)
            modifier_key = _get_paste_modifier_key()
            pyautogui.hotkey(modifier_key, "v")

            clipboard_restored = False
            if restore_clipboard is not _CLIPBOARD_NOT_CAPTURED:
                try:
                    pyperclip.copy(restore_clipboard)
                    clipboard_restored = True
                except Exception as exc:
                    logger.warning("Failed to restore clipboard after paste: %s", exc)

            return {
                "input_mode": "paste",
                "paste_hotkey": f"{modifier_key}+v",
                "clipboard_restored": clipboard_restored,
            }

        def _should_use_paste_mode_for_type(text: str) -> bool:
            return "\n" in text or "\r" in text or len(text) >= _AUTO_PASTE_THRESHOLD

        def _execute_action():
            if action == "type":
                text = _get_text_input()
                metadata: Dict[str, Any] = {
                    "action": "type",
                    "input_type": "text",
                    "input_length": len(text),
                    "input_mode": "type",
                }

                if _should_use_paste_mode_for_type(text):
                    metadata.update(_paste_text(text))
                else:
                    pyautogui.write(text, interval=0.01)

                return {
                    "action": "type",
                    "input": text[:50] + "..." if len(text) > 50 else text,
                    "message": f"Typed text: '{text}'",
                    "llm_content": f"Typed text: '{text}'",
                    "return_display": f"Typed text: '{text}'",
                    "metadata": metadata,
                }

            elif action == "paste":
                text = _get_text_input()
                metadata = _paste_text(text)
                return {
                    "action": "paste",
                    "input": text[:50] + "..." if len(text) > 50 else text,
                    "message": f"Pasted text: '{text}'",
                    "llm_content": f"Pasted text: '{text}'",
                    "return_display": f"Pasted text: '{text}'",
                    "metadata": {
                        "action": "paste",
                        "input_type": "text",
                        "input_length": len(text),
                        **metadata,
                    },
                }

            elif action == "press":
                key = args.get("key")
                if not key:
                    raise ValueError("key parameter required for press action")

                key_name = _normalize_key_name(key)
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

                mapped_keys = _normalize_hotkey_keys(keys)
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
    except ImportError as e:
        message = str(e).strip().lower()
        if "pyperclip" in message:
            logger.error("pyperclip not available, cannot execute clipboard paste")
            return {"success": False, "error": "pyperclip library not available"}
        logger.error("pyautogui not available, cannot execute keyboard control")
        return {"success": False, "error": "pyautogui library not available"}
    except Exception as e:
        logger.error(f"Keyboard action failed: {e}", exc_info=True)
        return {"success": False, "error": f"Keyboard action failed: {str(e)}"}
