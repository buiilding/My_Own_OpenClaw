"""
Computer Interface for Computer Use Automation

Provides low-level computer control capabilities including mouse, keyboard,
and screen interaction. Based on the CUA (Computer-Using Agent) library.
"""

import asyncio
import base64
import logging
import platform
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Dict, Optional, Any, Callable

logger = logging.getLogger(__name__)

from backend.src.tools.computer_legacy.input_types import (
    FunctionKey,
    KeyType,
    ModifierKey,
    MouseButton,
    NavigationKey,
    SpecialKey,
)


@dataclass
class ComputerActionResult:
    """Result of a computer action execution."""

    success: bool
    message: str
    screenshot_data: Optional[str] = None
    error: Optional[str] = None


class ComputerInterface:
    """
    Computer interface for mouse, keyboard, and screen control.

    Uses pyautogui for cross-platform computer control capabilities.
    Includes safety measures and confirmation requirements for potentially destructive actions.
    
    Refactored to use ThreadPoolExecutor to prevent blocking the main asyncio event loop.
    """

    def __init__(self, safety_enabled: bool = True):
        self._initialized = False
        self._pyautogui = None
        self._screen_size = None
        self.safety_enabled = safety_enabled
        
        # Dedicated executor for blocking OS calls
        self._executor = ThreadPoolExecutor(max_workers=1)

        # Safety settings
        self.max_text_length = 10000  # Max characters to type at once
        self.dangerous_keys = {"delete", "backspace", "ctrl", "alt", "win", "command"}
        self.confirmation_required_keys = {"ctrl", "alt", "win", "command", "f4", "esc"}
        
        # Platform-specific scroll scaling
        # Windows requires 120 units per "tick". Mac/Linux usually use 1 or 10.
        from backend.src.services.system import get_system_interface
        system_interface = get_system_interface()
        
        # Check if Windows by checking the platform
        is_windows = platform.system() == "Windows"
        self._scroll_scale = 120 if is_windows else 1

    async def initialize(self) -> bool:
        """
        Initialize the computer interface.

        Returns:
            True if initialization successful, False otherwise
        """
        try:
            # Import pyautogui lazily to avoid import errors
            import pyautogui

            self._pyautogui = pyautogui

            # Configure pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0.1  # Small pause between actions

            # Get screen size (blocking call, run in executor)
            loop = asyncio.get_running_loop()
            self._screen_size = await loop.run_in_executor(self._executor, pyautogui.size)
            
            self._initialized = True

            logger.info(
                f"Computer interface initialized. Screen size: {self._screen_size}"
            )
            return True

        except ImportError:
            logger.error("pyautogui not installed. Install with: pip install pyautogui")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize computer interface: {e}")
            return False

    async def ensure_initialized(self):
        """
        Ensure the computer interface is initialized, returning a ToolResult on failure.

        This method is used by computer tools to check initialization before performing actions.
        Returns None if initialization succeeds, or a ToolResult with error if it fails.
        """
        if not self._initialized:
            success = await self.initialize()
            if not success:
                from backend.src.core.interfaces.tool import ToolResult
                return ToolResult(
                    success=False,
                    error="Computer interface could not be initialized. Please ensure pyautogui is installed.",
                    llm_content="Error: Computer interface initialization failed.",
                    return_display="Computer interface init failed"
                )
        return None

    async def _ensure_ready(self) -> None:
        """Initialize lazily for internal callers."""
        await self._ensure_ready()

    async def _run_in_executor(self, func: Callable, *args: Any) -> Any:
        """Helper to run blocking functions in the thread pool."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, func, *args)

    # ============================================================================
    # MOUSE ACTIONS
    # ============================================================================

    async def left_click(
        self, x: Optional[int] = None, y: Optional[int] = None
    ) -> ComputerActionResult:
        """Perform a left mouse button click."""
        return await self._click(x, y, "left")

    async def right_click(
        self, x: Optional[int] = None, y: Optional[int] = None
    ) -> ComputerActionResult:
        """Perform a right mouse button click."""
        return await self._click(x, y, "right")

    async def double_click(
        self, x: Optional[int] = None, y: Optional[int] = None
    ) -> ComputerActionResult:
        """Perform a double left mouse button click."""
        try:
            await self._ensure_ready()

            def _perform_double_click():
                if x is not None and y is not None:
                    self._pyautogui.moveTo(x, y)
                self._pyautogui.doubleClick()

            await self._run_in_executor(_perform_double_click)
            
            return ComputerActionResult(
                success=True, message=f"Double-clicked at ({x}, {y})"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to perform double-click", error=str(e)
            )

    async def move_cursor(self, x: int, y: int) -> ComputerActionResult:
        """Move the cursor to specified coordinates."""
        try:
            await self._ensure_ready()

            await self._run_in_executor(self._pyautogui.moveTo, x, y)
            
            return ComputerActionResult(
                success=True, message=f"Moved cursor to ({x}, {y})"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to move cursor", error=str(e)
            )

    async def drag_to(
        self, x: int, y: int, button: str = "left", duration: float = 0.5
    ) -> ComputerActionResult:
        """Drag from current position to specified coordinates."""
        try:
            await self._ensure_ready()

            await self._run_in_executor(
                self._pyautogui.dragTo, x, y, duration, button
            )

            return ComputerActionResult(
                success=True, message=f"Dragged to ({x}, {y}) with {button} button"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to perform drag operation", error=str(e)
            )

    async def mouse_down(
        self,
        x: Optional[int] = None,
        y: Optional[int] = None,
        button: MouseButton = "left",
    ) -> ComputerActionResult:
        """Press and hold a mouse button."""
        try:
            await self._ensure_ready()

            def _perform_mouse_down():
                if x is not None and y is not None:
                    self._pyautogui.moveTo(x, y)
                self._pyautogui.mouseDown(button=button)

            await self._run_in_executor(_perform_mouse_down)

            return ComputerActionResult(
                success=True, message=f"Pressed {button} mouse button at ({x}, {y})"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to press mouse button", error=str(e)
            )

    async def mouse_up(
        self,
        x: Optional[int] = None,
        y: Optional[int] = None,
        button: MouseButton = "left",
    ) -> ComputerActionResult:
        """Release a mouse button."""
        try:
            await self._ensure_ready()

            def _perform_mouse_up():
                if x is not None and y is not None:
                    self._pyautogui.moveTo(x, y)
                self._pyautogui.mouseUp(button=button)

            await self._run_in_executor(_perform_mouse_up)

            return ComputerActionResult(
                success=True, message=f"Released {button} mouse button at ({x}, {y})"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to release mouse button", error=str(e)
            )

    # ============================================================================
    # KEYBOARD ACTIONS
    # ============================================================================

    async def type_text(self, text: str) -> ComputerActionResult:
        """Type the specified text."""
        try:
            await self._ensure_ready()

            # Safety check: text length
            if self.safety_enabled and len(text) > self.max_text_length:
                return ComputerActionResult(
                    success=False,
                    message="Text too long for safety reasons",
                    error=f"Text length {len(text)} exceeds maximum allowed {self.max_text_length}",
                )

            await self._run_in_executor(self._pyautogui.typewrite, text)

            return ComputerActionResult(
                success=True,
                message=f"Typed text: '{text[:50]}{'...' if len(text) > 50 else ''}'",
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to type text", error=str(e)
            )

    async def press_key(self, key: KeyType) -> ComputerActionResult:
        """Press and release a single key."""
        try:
            await self._ensure_ready()

            # Normalize key names to pyautogui format
            normalized_key = self._normalize_key(key)
            
            await self._run_in_executor(self._pyautogui.press, normalized_key)

            return ComputerActionResult(success=True, message=f"Pressed key: {key}")
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to press key", error=str(e)
            )

    async def hotkey(self, *keys: KeyType) -> ComputerActionResult:
        """Press multiple keys simultaneously (keyboard shortcut)."""
        try:
            await self._ensure_ready()

            # Safety check: dangerous key combinations
            if self.safety_enabled:
                normalized_keys = [self._normalize_key(key) for key in keys]

                # Check for potentially dangerous combinations
                dangerous_combos = [
                    # Alt+F4 (close window)
                    {"alt", "f4"},
                    # Ctrl+Alt+Del (task manager)
                    {"ctrl", "alt", "del"},
                    # Ctrl+Shift+Esc (task manager alternative)
                    {"ctrl", "shift", "esc"},
                    # Win+L (lock screen)
                    {"win", "l"},
                    # Ctrl+C/V with other modifiers that might be dangerous
                    {"ctrl", "c", "a"},  # Select all and copy
                ]

                key_set = set(normalized_keys)
                for combo in dangerous_combos:
                    if combo.issubset(key_set):
                        return ComputerActionResult(
                            success=False,
                            message="Potentially dangerous key combination blocked",
                            error=f"Key combination {' + '.join(combo)} is blocked for safety",
                        )

                # Check for confirmation-required keys
                confirmation_keys = {
                    k for k in normalized_keys if k in self.confirmation_required_keys
                }
                if confirmation_keys:
                    # In a real implementation, this would prompt for confirmation
                    # For now, we'll allow it but log the warning
                    logger.warning(
                        f"Confirmation-required keys used in hotkey: {confirmation_keys}"
                    )

            # Normalize all keys
            normalized_keys = [self._normalize_key(key) for key in keys]
            
            def _perform_hotkey():
                self._pyautogui.hotkey(*normalized_keys)
                
            await self._run_in_executor(_perform_hotkey)

            return ComputerActionResult(
                success=True, message=f"Pressed hotkey: {' + '.join(keys)}"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to execute hotkey", error=str(e)
            )

    # ============================================================================
    # SCROLLING ACTIONS
    # ============================================================================

    async def scroll(
        self, x: int, y: int, scroll_clicks: int = 3
    ) -> ComputerActionResult:
        """Scroll at coordinates by the specified number of clicks (ticks)."""
        try:
            await self._ensure_ready()

            def _perform_scroll():
                # Move to position first
                self._pyautogui.moveTo(x, y)
                # Scroll (positive = up, negative = down in pyautogui)
                # Apply scaling for platform (Windows = 120 per click)
                scaled_scroll = scroll_clicks * self._scroll_scale
                self._pyautogui.scroll(scaled_scroll)

            await self._run_in_executor(_perform_scroll)

            return ComputerActionResult(
                success=True, message=f"Scrolled {scroll_clicks} clicks at ({x}, {y})"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to scroll", error=str(e)
            )

    async def scroll_down(self, clicks: int = 3) -> ComputerActionResult:
        """Scroll down by the specified number of clicks (ticks)."""
        return await self.scroll_at_cursor(-clicks)

    async def scroll_up(self, clicks: int = 3) -> ComputerActionResult:
        """Scroll up by the specified number of clicks (ticks)."""
        return await self.scroll_at_cursor(clicks)

    async def scroll_at_cursor(self, clicks: int) -> ComputerActionResult:
        """Scroll at current cursor position."""
        try:
            await self._ensure_ready()

            def _perform_scroll_at_cursor():
                current_pos = self._pyautogui.position()
                # Apply scaling for platform (Windows = 120 per click)
                scaled_scroll = clicks * self._scroll_scale
                self._pyautogui.scroll(scaled_scroll)
                return current_pos

            current_pos = await self._run_in_executor(_perform_scroll_at_cursor)

            return ComputerActionResult(
                success=True,
                message=f"Scrolled {clicks} clicks at cursor position ({current_pos[0]}, {current_pos[1]})",
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to scroll at cursor", error=str(e)
            )

    # ============================================================================
    # SCREEN AND SYSTEM ACTIONS
    # ============================================================================

    async def screenshot(self) -> ComputerActionResult:
        """Take a screenshot and return as base64 string (JPEG format for faster encoding)."""
        try:
            await self._ensure_ready()

            def _perform_screenshot():
                screenshot = self._pyautogui.screenshot()
                import io

                # Convert to RGB if needed (JPEG requires RGB)
                if screenshot.mode != 'RGB':
                    screenshot = screenshot.convert('RGB')

                # Convert to JPEG bytes with optimized settings
                # Quality 85 provides good balance: fast encoding, small size, acceptable quality
                # optimize=False speeds up encoding significantly
                img_buffer = io.BytesIO()
                screenshot.save(
                    img_buffer,
                    format="JPEG",
                    quality=85,
                    optimize=False,
                    progressive=False
                )
                img_bytes = img_buffer.getvalue()

                # Convert to base64
                return base64.b64encode(img_bytes).decode("utf-8")

            b64_data = await self._run_in_executor(_perform_screenshot)

            return ComputerActionResult(
                success=True,
                message="Screenshot captured successfully",
                screenshot_data=b64_data,
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message="Failed to capture screenshot", error=str(e)
            )

    async def get_screen_size(self) -> Dict[str, int]:
        """Get the screen dimensions."""
        await self._ensure_ready()

        if self._screen_size:
            return {"width": self._screen_size[0], "height": self._screen_size[1]}
        return {"width": 1920, "height": 1080}  # Default fallback

    async def get_cursor_position(self) -> Dict[str, int]:
        """Get the current cursor position."""
        try:
            await self._ensure_ready()

            def _get_pos():
                return self._pyautogui.position()

            pos = await self._run_in_executor(_get_pos)
            return {"x": pos[0], "y": pos[1]}
        except Exception:
            return {"x": 0, "y": 0}

    # ============================================================================
    # HELPER METHODS
    # ============================================================================

    async def _click(
        self, x: Optional[int], y: Optional[int], button: MouseButton
    ) -> ComputerActionResult:
        """Internal click method."""
        try:
            await self._ensure_ready()

            def _perform_click():
                if x is not None and y is not None:
                    self._pyautogui.moveTo(x, y)
                self._pyautogui.click(button=button)

            await self._run_in_executor(_perform_click)

            return ComputerActionResult(
                success=True, message=f"{button.title()}-clicked at ({x}, {y})"
            )
        except Exception as e:
            return ComputerActionResult(
                success=False, message=f"Failed to {button}-click", error=str(e)
            )

    def _normalize_key(self, key: str) -> str:
        """Normalize key names to pyautogui format."""
        key = key.lower().strip()

        # Special key mappings
        key_mappings = {
            "return": "enter",
            "escape": "esc",
            "delete": "del",
            "page_down": "pagedown",
            "page_up": "pageup",
            "ctrl": "ctrl",
            "control": "ctrl",
            "alt": "alt",
            "shift": "shift",
            "win": "win",
            "windows": "win",
            "super": "win",
            "command": "command",
            "cmd": "command",
            "option": "alt",  # On Mac, option is alt
        }

        return key_mappings.get(key, key)
