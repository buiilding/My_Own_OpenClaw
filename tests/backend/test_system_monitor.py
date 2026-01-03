"""
Unit tests for the SystemMonitor service.

This tests the core functionality of system state monitoring including:
- Active window detection
- Mouse position tracking
- Clipboard content retrieval
- Screen resolution detection
- Internet connectivity checking
- Time formatting
"""

import unittest
import asyncio
from unittest.mock import patch, MagicMock
from pathlib import Path
import sys

# Add the codebase root to Python path
codebase_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(codebase_root))

from backend.src.services.system_monitor import system_monitor


class TestSystemMonitor(unittest.TestCase):
    """Test cases for SystemMonitor functionality."""

    def setUp(self):
        """Set up test fixtures."""
        # Reset the system monitor for each test
        system_monitor._screen_size = "Unknown"

    def test_get_active_window(self):
        """Test active window detection."""
        window_title = system_monitor.get_active_window()
        self.assertIsInstance(window_title, str)
        # Should return some kind of string, even if it's an error message
        self.assertTrue(len(window_title) > 0)

    def test_get_mouse_position(self):
        """Test mouse position retrieval."""
        position = system_monitor.get_mouse_position()
        self.assertIsInstance(position, str)
        # Should be in format "(x, y)" or some fallback
        self.assertTrue(len(position) > 0)

    def test_get_clipboard_preview(self):
        """Test clipboard content retrieval."""
        content = system_monitor.get_clipboard_preview()
        self.assertIsInstance(content, str)
        # Should be truncated and safe
        self.assertLessEqual(len(content), 100)

    def test_get_screen_resolution(self):
        """Test screen resolution detection."""
        resolution = system_monitor.get_screen_resolution()
        self.assertIsInstance(resolution, str)
        self.assertTrue(len(resolution) > 0)

    def test_get_system_time(self):
        """Test system time formatting."""
        time_str = system_monitor.get_system_time()
        self.assertIsInstance(time_str, str)
        # Should be in YYYY-MM-DD HH:MM:SS format
        self.assertRegex(time_str, r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}')

    def test_check_internet(self):
        """Test internet connectivity checking."""
        status = system_monitor.check_internet()
        self.assertIsInstance(status, str)
        self.assertIn(status, ["Online", "Offline"])

    @patch('backend.src.services.system_monitor.pyautogui')
    def test_mouse_position_with_mock(self, mock_pyautogui):
        """Test mouse position with mocked pyautogui."""
        mock_pyautogui.position.return_value = (100, 200)
        position = system_monitor.get_mouse_position()
        self.assertEqual(position, "(100, 200)")
        mock_pyautogui.position.assert_called_once()

    @patch('backend.src.services.system_monitor.pyautogui')
    def test_mouse_position_fallback(self, mock_pyautogui):
        """Test mouse position fallback when pyautogui fails."""
        mock_pyautogui.position.side_effect = Exception("Mock error")
        position = system_monitor.get_mouse_position()
        self.assertEqual(position, "(0, 0)")

    @patch('backend.src.services.system_monitor.pyperclip')
    def test_clipboard_with_mock(self, mock_pyperclip):
        """Test clipboard with mocked pyperclip."""
        mock_pyperclip.paste.return_value = "Test clipboard content"
        content = system_monitor.get_clipboard_preview()
        self.assertEqual(content, "Test clipboard content")
        mock_pyperclip.paste.assert_called_once()

    @patch('backend.src.services.system_monitor.pyperclip')
    def test_clipboard_truncation(self, mock_pyperclip):
        """Test clipboard content truncation."""
        long_content = "x" * 150
        mock_pyperclip.paste.return_value = long_content
        content = system_monitor.get_clipboard_preview()
        self.assertEqual(len(content), 103)  # 100 chars + "..."
        self.assertTrue(content.endswith("..."))

    @patch('backend.src.services.system_monitor.socket')
    def test_internet_online(self, mock_socket):
        """Test internet connectivity when online."""
        mock_socket.create_connection.return_value.__enter__ = MagicMock()
        status = system_monitor.check_internet()
        self.assertEqual(status, "Online")

    @patch('backend.src.services.system_monitor.socket')
    def test_internet_offline(self, mock_socket):
        """Test internet connectivity when offline."""
        mock_socket.create_connection.side_effect = OSError("Connection failed")
        status = system_monitor.check_internet()
        self.assertEqual(status, "Offline")


if __name__ == '__main__':
    unittest.main()
