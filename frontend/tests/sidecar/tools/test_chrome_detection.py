"""
Tests for Chrome detection module.
"""

import platform
from pathlib import Path
from unittest import mock

import pytest

# Import the module under test
from tools.browser.chrome_detection import (
    ChromeExecutable,
    _find_linux_chrome,
    _find_macos_chrome,
    _find_windows_chrome,
    find_all_chrome_executables,
    find_chrome_executable,
)


class TestChromeExecutable:
    """Test ChromeExecutable dataclass."""

    def test_creation(self):
        """Test creating ChromeExecutable."""
        exe = ChromeExecutable(path="/usr/bin/chrome", kind="chrome")
        assert exe.path == "/usr/bin/chrome"
        assert exe.kind == "chrome"


class TestLinuxDetection:
    """Test Linux Chrome detection."""

    @mock.patch("os.path.isfile")
    @mock.patch("os.access")
    def test_find_linux_chrome_google(self, mock_access, mock_isfile):
        """Test finding Google Chrome on Linux."""
        mock_isfile.return_value = True
        mock_access.return_value = True

        results = _find_linux_chrome()

        # Should find at least one chrome
        assert len(results) > 0
        assert any(e.kind == "chrome" for e in results)

    @mock.patch("os.path.isfile")
    @mock.patch("os.access")
    def test_find_linux_chrome_none_exist(self, mock_access, mock_isfile):
        """Test when no Chrome exists on Linux."""
        mock_isfile.return_value = False
        mock_access.return_value = False

        with mock.patch("subprocess.run") as mock_run:
            mock_run.return_value = mock.Mock(returncode=1)
            results = _find_linux_chrome()

        assert results == []


class TestMacOSDetection:
    """Test macOS Chrome detection."""

    @mock.patch("os.path.isfile")
    @mock.patch("os.access")
    @mock.patch("platform.system")
    def test_find_macos_chrome(self, mock_system, mock_access, mock_isfile):
        """Test finding Chrome on macOS."""
        mock_system.return_value = "Darwin"
        mock_isfile.return_value = True
        mock_access.return_value = True

        results = _find_macos_chrome()

        # Should find various browsers
        assert len(results) > 0


class TestWindowsDetection:
    """Test Windows Chrome detection."""

    @mock.patch("os.path.isfile")
    @mock.patch.dict(
        "os.environ",
        {
            "ProgramFiles": r"C:\Program Files",
            "ProgramFiles(x86)": r"C:\Program Files (x86)",
            "LocalAppData": r"C:\Users\Test\AppData\Local",
        },
    )
    def test_find_windows_chrome(self, mock_isfile):
        """Test finding Chrome on Windows."""
        mock_isfile.return_value = True

        results = _find_windows_chrome()

        # Should find various browsers
        assert len(results) > 0


class TestFindAllChrome:
    """Test find_all_chrome_executables."""

    @mock.patch("platform.system")
    @mock.patch("tools.browser.chrome_detection._find_linux_chrome")
    def test_find_all_linux(self, mock_linux, mock_system):
        """Test finding all Chrome on Linux."""
        mock_system.return_value = "Linux"
        mock_linux.return_value = [
            ChromeExecutable("/usr/bin/chrome", "chrome"),
        ]

        results = find_all_chrome_executables()

        assert len(results) == 1
        assert results[0].kind == "chrome"

    @mock.patch("platform.system")
    @mock.patch("tools.browser.chrome_detection._find_macos_chrome")
    def test_find_all_macos(self, mock_macos, mock_system):
        """Test finding all Chrome on macOS."""
        mock_system.return_value = "Darwin"
        mock_macos.return_value = [
            ChromeExecutable("/Applications/Chrome.app", "chrome"),
        ]

        results = find_all_chrome_executables()

        assert len(results) == 1

    @mock.patch("platform.system")
    def test_find_all_unknown_platform(self, mock_system):
        """Test finding Chrome on unknown platform."""
        mock_system.return_value = "UnknownOS"

        results = find_all_chrome_executables()

        assert results == []


class TestFindChromeExecutable:
    """Test find_chrome_executable."""

    @mock.patch("tools.browser.chrome_detection.find_all_chrome_executables")
    def test_priority_order(self, mock_find_all):
        """Test priority order when no preference given."""
        mock_find_all.return_value = [
            ChromeExecutable("/usr/bin/brave", "brave"),
            ChromeExecutable("/usr/bin/chrome", "chrome"),
        ]

        result = find_chrome_executable()

        # Chrome should be preferred over Brave
        assert result is not None
        assert result.kind == "chrome"

    @mock.patch("tools.browser.chrome_detection.find_all_chrome_executables")
    def test_no_chrome_found(self, mock_find_all):
        """Test when no Chrome is found."""
        mock_find_all.return_value = []

        result = find_chrome_executable()

        assert result is None
