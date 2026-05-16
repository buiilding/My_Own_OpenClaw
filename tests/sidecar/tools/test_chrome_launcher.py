"""
Tests for Chrome launcher module.
"""

import asyncio
import subprocess
from pathlib import Path
from unittest import mock

import pytest

from tools.browser.chrome_launcher import (
    is_cdp_available,
    find_chrome_process,
    is_chrome_running_with_cdp,
    get_chrome_user_data_dir,
    launch_chrome_with_cdp,
    kill_existing_chrome,
    ensure_chrome_with_cdp,
    is_cdp_download_behavior_supported,
    terminate_windie_chrome_with_cdp,
    ChromeLauncher,
    ChromeNotFoundError,
    ChromeLaunchTimeoutError,
    DEFAULT_CDP_URL,
)


class TestIsCdpAvailable:
    """Test is_cdp_available function."""

    @staticmethod
    def _patch_client_session(mock_session_class, get_context_manager):
        mock_session = mock.MagicMock()
        mock_session.get = mock.MagicMock(return_value=get_context_manager)
        mock_session_class.return_value.__aenter__ = mock.AsyncMock(
            return_value=mock_session
        )
        mock_session_class.return_value.__aexit__ = mock.AsyncMock(return_value=False)

    @pytest.mark.asyncio
    async def test_cdp_available_success(self):
        """Test detecting available CDP."""
        # Create a mock response that will be returned by the context manager
        mock_response = mock.AsyncMock()
        mock_response.status = 200

        # Create an async context manager mock for session.get()
        mock_get_cm = mock.AsyncMock()
        mock_get_cm.__aenter__ = mock.AsyncMock(return_value=mock_response)
        mock_get_cm.__aexit__ = mock.AsyncMock(return_value=False)

        with mock.patch(
            "tools.browser.chrome_launcher.aiohttp.ClientSession"
        ) as mock_session_class:
            self._patch_client_session(mock_session_class, mock_get_cm)

            result = await is_cdp_available(DEFAULT_CDP_URL)

            assert result is True

    @pytest.mark.asyncio
    async def test_cdp_available_failure(self):
        """Test detecting unavailable CDP."""
        mock_get_cm = mock.AsyncMock()
        mock_get_cm.__aenter__ = mock.AsyncMock(
            side_effect=Exception("Connection refused")
        )
        mock_get_cm.__aexit__ = mock.AsyncMock(return_value=False)

        with mock.patch(
            "tools.browser.chrome_launcher.aiohttp.ClientSession"
        ) as mock_session_class:
            self._patch_client_session(mock_session_class, mock_get_cm)

            result = await is_cdp_available(DEFAULT_CDP_URL)

            assert result is False


class TestCdpDownloadBehaviorSupport:
    """Test probing CDP support for Playwright attach setup."""

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.aiohttp.ClientSession")
    async def test_download_behavior_supported(self, mock_session_class):
        """A successful Browser.setDownloadBehavior probe is supported."""
        mock_response = mock.AsyncMock()
        mock_response.status = 200
        mock_response.json.return_value = {
            "webSocketDebuggerUrl": "ws://127.0.0.1:9333/devtools/browser/test"
        }
        mock_get_cm = mock.AsyncMock()
        mock_get_cm.__aenter__ = mock.AsyncMock(return_value=mock_response)
        mock_get_cm.__aexit__ = mock.AsyncMock(return_value=False)

        mock_ws = mock.AsyncMock()
        mock_message = mock.Mock()
        mock_message.type = 1
        mock_message.json.return_value = {"id": 1, "result": {}}
        mock_ws.receive = mock.AsyncMock(return_value=mock_message)
        mock_ws_cm = mock.AsyncMock()
        mock_ws_cm.__aenter__ = mock.AsyncMock(return_value=mock_ws)
        mock_ws_cm.__aexit__ = mock.AsyncMock(return_value=False)

        mock_session = mock.MagicMock()
        mock_session.get = mock.MagicMock(return_value=mock_get_cm)
        mock_session.ws_connect = mock.MagicMock(return_value=mock_ws_cm)
        mock_session_class.return_value.__aenter__ = mock.AsyncMock(
            return_value=mock_session
        )
        mock_session_class.return_value.__aexit__ = mock.AsyncMock(return_value=False)

        assert await is_cdp_download_behavior_supported(DEFAULT_CDP_URL) is True
        mock_ws.send_json.assert_awaited_once_with(
            {
                "id": 1,
                "method": "Browser.setDownloadBehavior",
                "params": {"behavior": "default"},
            }
        )

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.aiohttp.ClientSession")
    async def test_download_behavior_rejected(self, mock_session_class):
        """A CDP endpoint that rejects Browser.setDownloadBehavior is unsupported."""
        mock_response = mock.AsyncMock()
        mock_response.status = 200
        mock_response.json.return_value = {
            "webSocketDebuggerUrl": "ws://127.0.0.1:9333/devtools/browser/test"
        }
        mock_get_cm = mock.AsyncMock()
        mock_get_cm.__aenter__ = mock.AsyncMock(return_value=mock_response)
        mock_get_cm.__aexit__ = mock.AsyncMock(return_value=False)

        mock_ws = mock.AsyncMock()
        mock_message = mock.Mock()
        mock_message.type = 1
        mock_message.json.return_value = {
            "id": 1,
            "error": {"message": "Browser context management is not supported."},
        }
        mock_ws.receive = mock.AsyncMock(return_value=mock_message)
        mock_ws_cm = mock.AsyncMock()
        mock_ws_cm.__aenter__ = mock.AsyncMock(return_value=mock_ws)
        mock_ws_cm.__aexit__ = mock.AsyncMock(return_value=False)

        mock_session = mock.MagicMock()
        mock_session.get = mock.MagicMock(return_value=mock_get_cm)
        mock_session.ws_connect = mock.MagicMock(return_value=mock_ws_cm)
        mock_session_class.return_value.__aenter__ = mock.AsyncMock(
            return_value=mock_session
        )
        mock_session_class.return_value.__aexit__ = mock.AsyncMock(return_value=False)

        assert await is_cdp_download_behavior_supported(DEFAULT_CDP_URL) is False


class TestFindChromeProcess:
    """Test find_chrome_process function."""

    @mock.patch("platform.system")
    @mock.patch("subprocess.run")
    def test_find_chrome_windows(self, mock_run, mock_system):
        """Test finding Chrome on Windows."""
        mock_system.return_value = "Windows"
        mock_run.return_value = mock.Mock(
            stdout='"Image Name","PID","Session Name","Session#","Mem Usage"\n"chrome.exe","12345","Console","1","123,456 K"',
            returncode=0,
        )

        result = find_chrome_process()

        assert result == 12345

    @mock.patch("platform.system")
    @mock.patch("subprocess.run")
    def test_find_chrome_linux(self, mock_run, mock_system):
        """Test finding Chrome on Linux."""
        mock_system.return_value = "Linux"
        mock_run.return_value = mock.Mock(stdout="12345\n12346\n", returncode=0)

        result = find_chrome_process()

        assert result == 12345

    @mock.patch("platform.system")
    @mock.patch("subprocess.run")
    def test_no_chrome_running(self, mock_run, mock_system):
        """Test when Chrome is not running."""
        mock_system.return_value = "Linux"
        mock_run.return_value = mock.Mock(stdout="", returncode=1)

        result = find_chrome_process()

        assert result is None


class TestIsChromeRunningWithCdp:
    """Test is_chrome_running_with_cdp function."""

    @mock.patch("socket.socket")
    def test_port_open(self, mock_socket_class):
        """Test when port is open."""
        mock_sock = mock.Mock()
        mock_sock.connect_ex.return_value = 0
        mock_socket_class.return_value = mock_sock

        result = is_chrome_running_with_cdp(9222)

        assert result is True

    @mock.patch("socket.socket")
    def test_port_closed(self, mock_socket_class):
        """Test when port is closed."""
        mock_sock = mock.Mock()
        mock_sock.connect_ex.return_value = 61  # Connection refused
        mock_socket_class.return_value = mock_sock

        result = is_chrome_running_with_cdp(9222)

        assert result is False


class TestGetChromeUserDataDir:
    """Test get_chrome_user_data_dir function."""

    @mock.patch("platform.system")
    @mock.patch("pathlib.Path.home")
    def test_macos_path(self, mock_home, mock_system):
        """Test macOS user data path."""
        mock_system.return_value = "Darwin"
        mock_home.return_value = Path("/Users/test")

        result = get_chrome_user_data_dir()

        assert result is not None
        assert str(result).endswith(
            "Library/Application Support/WindieOS/BrowserProfile"
        )

    @mock.patch("platform.system")
    @mock.patch("pathlib.Path.home")
    def test_linux_path(self, mock_home, mock_system):
        """Test Linux user data path."""
        mock_system.return_value = "Linux"
        mock_home.return_value = Path("/home/test")

        result = get_chrome_user_data_dir()

        assert result is not None
        assert str(result).endswith(".config/windieos/browser-profile")

    @mock.patch("platform.system")
    @mock.patch("os.environ.get")
    @mock.patch("pathlib.Path.home")
    def test_windows_path(self, mock_home, mock_env_get, mock_system):
        """Test Windows user data path."""
        mock_system.return_value = "Windows"
        mock_home.return_value = Path("C:/Users/test")
        mock_env_get.return_value = "C:/Users/test/AppData/Local"

        result = get_chrome_user_data_dir()

        assert result is not None
        assert str(result).endswith("AppData/Local/WindieOS/BrowserProfile")


class TestLaunchChromeWithCdp:
    """Test launch_chrome_with_cdp function."""

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.find_chrome_executable")
    @mock.patch("tools.browser.chrome_launcher.get_chrome_user_data_dir")
    @mock.patch("subprocess.Popen")
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    async def test_launch_success(
        self, mock_available, mock_popen, mock_user_data_dir, mock_find
    ):
        """Test successful Chrome launch."""
        mock_find.return_value = mock.Mock(path="/usr/bin/chrome")
        mock_user_data_dir.return_value = Path("/tmp/test-google-chrome-cdp")
        mock_process = mock.Mock()
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process
        mock_available.return_value = True

        process, cdp_url = await launch_chrome_with_cdp()

        assert process is mock_process
        assert cdp_url == DEFAULT_CDP_URL
        mock_popen.assert_called_once()
        launch_args = mock_popen.call_args.args[0]
        assert "--user-data-dir=/tmp/test-google-chrome-cdp" in launch_args
        assert "--profile-directory=Default" in launch_args
        assert "--no-first-run" not in launch_args

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.find_chrome_executable")
    async def test_chrome_not_found(self, mock_find):
        """Test when Chrome executable not found."""
        mock_find.return_value = None

        with pytest.raises(ChromeNotFoundError):
            await launch_chrome_with_cdp()

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.find_chrome_executable")
    @mock.patch("tools.browser.chrome_launcher.get_chrome_user_data_dir")
    @mock.patch("subprocess.Popen")
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    async def test_launch_timeout(
        self, mock_available, mock_popen, mock_user_data_dir, mock_find
    ):
        """Test when Chrome fails to start within timeout."""
        mock_find.return_value = mock.Mock(path="/usr/bin/chrome")
        mock_user_data_dir.return_value = Path("/tmp/test-google-chrome-cdp")
        mock_process = mock.Mock()
        mock_process.poll.return_value = None
        mock_popen.return_value = mock_process
        mock_available.return_value = False  # Never becomes available

        with (
            mock.patch("tools.browser.chrome_launcher.CHROME_STARTUP_TIMEOUT", 0),
            mock.patch(
                "tools.browser.chrome_launcher.asyncio.sleep", new=mock.AsyncMock()
            ),
        ):
            with pytest.raises(ChromeLaunchTimeoutError):
                await launch_chrome_with_cdp()

        # Should have tried to kill the process
        mock_process.terminate.assert_called_once()


class TestKillExistingChrome:
    """Test kill_existing_chrome function."""

    @pytest.mark.asyncio
    @mock.patch("platform.system")
    @mock.patch("subprocess.run")
    @mock.patch("tools.browser.chrome_launcher.find_chrome_process")
    async def test_kill_success(self, mock_find, mock_run, mock_system):
        """Test successful kill."""
        mock_system.return_value = "Linux"
        mock_run.return_value = mock.Mock(returncode=0)
        mock_find.side_effect = [12345, None]  # Running, then killed

        with mock.patch(
            "tools.browser.chrome_launcher.asyncio.sleep", new=mock.AsyncMock()
        ):
            result = await kill_existing_chrome()

        assert result is True
        mock_run.assert_called_with(["pkill", "-f", "chrome"], capture_output=True)

    @pytest.mark.asyncio
    @mock.patch("platform.system")
    @mock.patch("subprocess.run")
    async def test_kill_error(self, mock_run, mock_system):
        """Test kill with error."""
        mock_system.return_value = "Linux"
        mock_run.side_effect = Exception("pkill failed")

        result = await kill_existing_chrome()

        assert result is False


class TestTerminateWindieChromeWithCdp:
    """Test terminating only WindieOS-owned CDP Chrome processes."""

    @pytest.mark.asyncio
    @mock.patch(
        "tools.browser.chrome_launcher.asyncio.sleep", new_callable=mock.AsyncMock
    )
    @mock.patch("tools.browser.chrome_launcher.psutil.wait_procs")
    @mock.patch("tools.browser.chrome_launcher._iter_windie_chrome_processes")
    async def test_terminates_matching_processes(
        self, mock_iter_processes, mock_wait_procs, _mock_sleep
    ):
        process = mock.Mock()
        mock_iter_processes.return_value = [process]
        mock_wait_procs.return_value = ([process], [])

        result = await terminate_windie_chrome_with_cdp(9333)

        assert result == 1
        process.terminate.assert_called_once()
        process.kill.assert_not_called()

    @pytest.mark.asyncio
    @mock.patch(
        "tools.browser.chrome_launcher.asyncio.sleep", new_callable=mock.AsyncMock
    )
    @mock.patch("tools.browser.chrome_launcher.psutil.wait_procs")
    @mock.patch("tools.browser.chrome_launcher._iter_windie_chrome_processes")
    async def test_kills_processes_that_ignore_terminate(
        self, mock_iter_processes, mock_wait_procs, _mock_sleep
    ):
        process = mock.Mock()
        mock_iter_processes.return_value = [process]
        mock_wait_procs.return_value = ([], [process])

        result = await terminate_windie_chrome_with_cdp(9333)

        assert result == 1
        process.terminate.assert_called_once()
        process.kill.assert_called_once()


class TestEnsureChromeWithCdp:
    """Test ensure_chrome_with_cdp function."""

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.is_cdp_download_behavior_supported")
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    async def test_already_available(self, mock_available, mock_download_supported):
        """Test when CDP is already available."""
        mock_available.return_value = True
        mock_download_supported.return_value = True

        result = await ensure_chrome_with_cdp()

        assert result == DEFAULT_CDP_URL

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.is_cdp_download_behavior_supported")
    @mock.patch("tools.browser.chrome_launcher.terminate_windie_chrome_with_cdp")
    @mock.patch("tools.browser.chrome_launcher.launch_chrome_with_cdp")
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    async def test_restarts_incompatible_windie_cdp_endpoint(
        self, mock_available, mock_launch, mock_terminate, mock_download_supported
    ):
        """Restart Windie-owned Chrome when CDP rejects Playwright attach setup."""
        mock_available.return_value = True
        mock_download_supported.return_value = False
        mock_terminate.return_value = 1
        mock_process = mock.Mock()
        mock_launch.return_value = (mock_process, "http://127.0.0.1:9333")

        result = await ensure_chrome_with_cdp(auto_launch=True)

        assert result == "http://127.0.0.1:9333"
        mock_terminate.assert_awaited_once_with(9333)
        mock_launch.assert_awaited_once()

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.is_cdp_download_behavior_supported")
    @mock.patch("tools.browser.chrome_launcher.terminate_windie_chrome_with_cdp")
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    async def test_rejects_incompatible_non_windie_cdp_endpoint(
        self, mock_available, mock_terminate, mock_download_supported
    ):
        """Do not kill or replace a non-Windie process bound to the CDP port."""
        mock_available.return_value = True
        mock_download_supported.return_value = False
        mock_terminate.return_value = 0

        with pytest.raises(Exception) as exc_info:
            await ensure_chrome_with_cdp(auto_launch=True)

        assert "not a WindieOS-owned browser" in str(exc_info.value)

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    @mock.patch("tools.browser.chrome_launcher.find_chrome_process")
    @mock.patch("tools.browser.chrome_launcher.launch_chrome_with_cdp")
    async def test_auto_launch(self, mock_launch, mock_find, mock_available):
        """Test auto-launching Chrome when not running."""
        mock_available.return_value = False
        mock_find.return_value = None  # Chrome not running
        mock_process = mock.Mock()
        mock_launch.return_value = (mock_process, "http://127.0.0.1:9222")

        result = await ensure_chrome_with_cdp(auto_launch=True)

        assert result == "http://127.0.0.1:9222"
        mock_launch.assert_called_once()

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    @mock.patch("tools.browser.chrome_launcher.find_chrome_process")
    async def test_no_auto_launch(self, mock_find, mock_available):
        """Test error when auto_launch disabled."""
        mock_available.return_value = False
        mock_find.return_value = None

        with pytest.raises(Exception) as exc_info:
            await ensure_chrome_with_cdp(auto_launch=False)

        assert "auto_launch is disabled" in str(exc_info.value)


class TestChromeLauncher:
    """Test ChromeLauncher class."""

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    async def test_use_existing(self, mock_available):
        """Test using existing Chrome."""
        mock_available.return_value = True

        launcher = ChromeLauncher()
        result = await launcher.launch()

        assert result == DEFAULT_CDP_URL
        assert not launcher._launched_by_us

    @pytest.mark.asyncio
    @mock.patch("tools.browser.chrome_launcher.is_cdp_available")
    @mock.patch("tools.browser.chrome_launcher.launch_chrome_with_cdp")
    async def test_launch_new(self, mock_launch, mock_available):
        """Test launching new Chrome."""
        mock_available.return_value = False
        mock_process = mock.Mock()
        mock_launch.return_value = (mock_process, "http://127.0.0.1:9222")

        launcher = ChromeLauncher()
        result = await launcher.launch()

        assert result == "http://127.0.0.1:9222"
        assert launcher._launched_by_us
        mock_launch.assert_called_once()

    @pytest.mark.asyncio
    async def test_shutdown(self):
        """Test shutdown functionality."""
        mock_process = mock.Mock()
        mock_process.poll.return_value = 0  # Already terminated

        launcher = ChromeLauncher()
        launcher.process = mock_process
        launcher._launched_by_us = True

        with mock.patch(
            "tools.browser.chrome_launcher.asyncio.sleep", new=mock.AsyncMock()
        ):
            await launcher.shutdown()

        mock_process.terminate.assert_called_once()
