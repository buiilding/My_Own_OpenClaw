#!/usr/bin/env python3
"""
Local Backend Service for Desktop Assistant.

Handles tool execution, system state collection, memory operations,
and wake-word detection. Communicates with Electron main process
via JSON-RPC 2.0 protocol over stdin/stdout.
"""

import asyncio
import glob
import logging
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Add the frontend python directory to the path
frontend_python_dir = Path(__file__).parent
sys.path.insert(0, str(frontend_python_dir))

from core.ipc_protocol import JSONRPCProtocol
from core.feature_pack_installer import (
    build_feature_pack_manual_install_message,
    ensure_feature_pack_site_packages_on_path,
    install_feature_pack,
    is_feature_pack_available,
)
from core.env_flags import env_flag_enabled
from core.executors import configure_event_loop_default_executor, shutdown_all_executors
from core.runtime_shutdown import (
    handle_shutdown_signal,
    register_shutdown_signal_handlers,
    request_stdin_shutdown,
)
from local_backend_memory_handlers import LocalBackendMemoryHandlersMixin

ensure_feature_pack_site_packages_on_path()

_LOCAL_MEMORY_STORE_IMPORT_ERROR: Exception | None = None
try:
    from memory.local_store import LocalMemoryStore
except Exception as exc:  # pragma: no cover - exercised in dependency-missing runtime paths
    LocalMemoryStore = None  # type: ignore[assignment]
    _LOCAL_MEMORY_STORE_IMPORT_ERROR = exc

try:
    from memory.summarizer import MemorySummarizer
except Exception as exc:  # pragma: no cover - exercised in dependency-missing runtime paths
    MemorySummarizer = None  # type: ignore[assignment]
    if _LOCAL_MEMORY_STORE_IMPORT_ERROR is None:
        _LOCAL_MEMORY_STORE_IMPORT_ERROR = exc

ENV_ENABLE_SEMANTIC_SUMMARIZER = "WINDIE_ENABLE_SEMANTIC_SUMMARIZER"
ENV_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL = "WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL"
ENV_PACKAGED_APP = "WINDIE_PACKAGED_APP"
ENV_SIDECAR_LOG_LEVEL = "WINDIE_SIDECAR_LOG_LEVEL"
CHROMIUM_INSTALL_TIMEOUT_SECONDS = 900

def _resolve_sidecar_log_level() -> int:
    """Resolve sidecar Python log level from env with warning-safe fallback."""
    raw = os.getenv(ENV_SIDECAR_LOG_LEVEL)
    if raw is None:
        return logging.WARNING
    normalized = raw.strip().upper()
    return getattr(logging, normalized, logging.WARNING)


def _collect_runtime_dependency_warnings() -> list[str]:
    """Collect host dependency warnings that should surface at startup/status."""
    warnings: list[str] = []
    if platform.system() != "Linux":
        return warnings

    if shutil.which("xdotool") is None:
        warnings.append(
            "Linux dependency missing: xdotool. Window switching and active-window probes "
            "may be degraded; Xlib fallback remains enabled. Install with "
            "`sudo apt install xdotool` (or distro equivalent)."
        )
    return warnings


# Configure logging
logging.basicConfig(
    level=_resolve_sidecar_log_level(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # Log to stderr to avoid interfering with stdout protocol
)
logger = logging.getLogger(__name__)
_active_backend: Optional["LocalBackend"] = None


class LocalBackend(LocalBackendMemoryHandlersMixin):
    """
    Main local backend service.
    
    Handles tool execution, system state, memory, and wake-word operations.
    """
    
    def __init__(self):
        self.protocol = JSONRPCProtocol()
        self.memory_store = None
        self._summarizer: Optional[MemorySummarizer] = None
        self._runtime_dependency_warnings: list[str] = []
        self._semantic_summarizer_enabled = env_flag_enabled(
            ENV_ENABLE_SEMANTIC_SUMMARIZER,
            default=True,
        )
        self._browser_feature_pack_autoinstall_enabled = env_flag_enabled(
            ENV_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL,
            default=True,
        )
        self._packaged_app = env_flag_enabled(
            ENV_PACKAGED_APP,
            default=False,
        )
        self._feature_pack_install_lock = asyncio.Lock()
        self._memory_store_unavailable_error: Optional[str] = None
        self.running = False
        self._shutdown_requested = False
        # Initialize tool registry once (reused for all tool executions)
        from tools.registry import ToolRegistry
        self.tool_registry = ToolRegistry()
        self._initialize_methods()
    
    def _initialize_methods(self):
        """Register all JSON-RPC methods."""
        # Tool execution methods
        self.protocol.register_method("execute_tool", self._handle_execute_tool)
        
        # System state methods
        self.protocol.register_method("get_system_state", self._handle_get_system_state)
        
        # Memory methods
        self.protocol.register_method("search_memory", self._handle_search_memory)
        self.protocol.register_method("store_memory", self._handle_store_memory)
        self.protocol.register_method("search_conversations", self._handle_search_conversations)
        self.protocol.register_method("list_conversations", self._handle_list_conversations)
        self.protocol.register_method("list_episodic_memories", self._handle_list_episodic_memories)
        self.protocol.register_method("get_conversation", self._handle_get_conversation)
        self.protocol.register_method("list_semantic_memories", self._handle_list_semantic_memories)
        self.protocol.register_method("delete_episodic_memory", self._handle_delete_episodic_memory)
        self.protocol.register_method("delete_conversation", self._handle_delete_conversation)
        self.protocol.register_method("delete_semantic_memory", self._handle_delete_semantic_memory)
        self.protocol.register_method("store_transcript", self._handle_store_transcript)
        
        # Health check and diagnostics
        self.protocol.register_method("ping", self._handle_ping)
        self.protocol.register_method("get_status", self._handle_get_status)
        self.protocol.register_method(
            "install_browser_chromium",
            self._handle_install_browser_chromium,
        )

    async def initialize(self) -> None:
        """Initialize the backend services."""
        logger.info("Initializing local backend...")
        
        try:
            configure_event_loop_default_executor(asyncio.get_running_loop())
            self._runtime_dependency_warnings = _collect_runtime_dependency_warnings()
            for warning in self._runtime_dependency_warnings:
                logger.warning(warning)

            # Initialize memory store
            logger.info("Initializing memory store...")
            if LocalMemoryStore is None:
                self.memory_store = None
                self._memory_store_unavailable_error = (
                    "memory runtime dependencies are unavailable"
                )
                logger.warning(
                    "Memory store dependencies unavailable at startup: %s",
                    _LOCAL_MEMORY_STORE_IMPORT_ERROR,
                )
            else:
                self.memory_store = LocalMemoryStore()
                await self.memory_store.initialize()
                logger.info("Memory store initialized")

            if self._semantic_summarizer_enabled and self.memory_store and MemorySummarizer is not None:
                try:
                    self._summarizer = MemorySummarizer(self.memory_store)
                    await self._summarizer.start()
                    logger.info("Memory summarizer started")
                except Exception as e:
                    logger.error(f"Failed to start memory summarizer: {e}", exc_info=True)
            else:
                logger.info(
                    "Memory summarizer disabled via %s",
                    ENV_ENABLE_SEMANTIC_SUMMARIZER,
                )
            
            # Note: Wake-word detection is kept as separate subprocess for now
            # due to binary protocol requirements. Can be integrated later.
            
            logger.info("Local backend initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize local backend: {e}", exc_info=True)
            raise

    async def _ensure_browser_tool_ready(self) -> Optional[str]:
        if self.tool_registry.has_tool("browser") and is_feature_pack_available("browser"):
            return None

        if not self._browser_feature_pack_autoinstall_enabled:
            if self._packaged_app:
                return (
                    "Browser runtime dependencies are missing from the bundled WindieOS install. "
                    "Reinstall WindieOS."
                )
            return (
                "Browser feature pack is unavailable in this runtime. "
                f"{build_feature_pack_manual_install_message('browser')}"
            )

        async with self._feature_pack_install_lock:
            if self.tool_registry.has_tool("browser") and is_feature_pack_available("browser"):
                return None

            logger.info("Installing browser feature pack on-demand...")
            ok, error = await asyncio.to_thread(install_feature_pack, "browser")
            if not ok:
                logger.error("Browser feature-pack installation failed: %s", error)
                return (
                    "Browser feature pack installation failed. "
                    f"{error or 'Unknown pip failure.'} "
                    f"{build_feature_pack_manual_install_message('browser')}"
                )

            self.tool_registry.reload_tools()
            if not self.tool_registry.has_tool("browser"):
                return (
                    "Browser feature pack installed but browser tool is still unavailable. "
                    "Restart WindieOS and retry."
                )

        return None

    def _resolve_playwright_browsers_path(self) -> Path:
        configured = os.getenv("PLAYWRIGHT_BROWSERS_PATH")
        if configured:
            return Path(configured).expanduser()

        system_name = platform.system()
        if system_name == "Windows":
            localappdata = os.getenv("LOCALAPPDATA")
            if localappdata:
                return Path(localappdata) / "ms-playwright"
        if system_name == "Darwin":
            return Path.home() / "Library" / "Caches" / "ms-playwright"
        return Path.home() / ".cache" / "ms-playwright"

    def _find_available_browser_binary(self) -> Optional[str]:
        system_name = platform.system()
        playwright_root = self._resolve_playwright_browsers_path()

        if system_name == "Darwin":
            patterns = [
                str(playwright_root / "chromium-*" / "chrome-mac" / "Chromium.app" / "Contents" / "MacOS" / "Chromium"),
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
                "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
                "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
                str(playwright_root / "chromium_headless_shell-*" / "chrome-mac" / "Chromium.app" / "Contents" / "MacOS" / "Chromium"),
            ]
        elif system_name == "Windows":
            patterns = [
                str(playwright_root / "chromium-*" / "chrome-win" / "chrome.exe"),
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
                r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe",
                r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe",
                str(playwright_root / "chromium_headless_shell-*" / "chrome-win" / "chrome.exe"),
                r"C:\Program Files\Chromium\Application\chrome.exe",
                r"C:\Program Files (x86)\Chromium\Application\chrome.exe",
                r"%LOCALAPPDATA%\Chromium\Application\chrome.exe",
                r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
                r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
                r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe",
            ]
        else:
            patterns = [
                str(playwright_root / "chromium-*" / "chrome-linux*" / "chrome"),
                "/usr/bin/google-chrome-stable",
                "/usr/bin/google-chrome",
                "/usr/local/bin/google-chrome",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
                "/usr/local/bin/chromium",
                "/snap/bin/chromium",
                "/usr/bin/google-chrome-beta",
                "/usr/bin/google-chrome-dev",
                "/usr/bin/brave-browser",
                str(playwright_root / "chromium_headless_shell-*" / "chrome-linux*" / "chrome"),
            ]

        for raw_pattern in patterns:
            pattern = os.path.expandvars(os.path.expanduser(raw_pattern))
            if "*" in pattern:
                matches = sorted(glob.glob(pattern))
                for candidate in reversed(matches):
                    candidate_path = Path(candidate)
                    if candidate_path.exists() and candidate_path.is_file():
                        return str(candidate_path)
                continue

            candidate_path = Path(pattern)
            if candidate_path.exists() and candidate_path.is_file():
                return str(candidate_path)

        return None
    
    async def _handle_ping(self) -> Dict[str, Any]:
        """Health check method."""
        return {"status": "ok", "service": "local_backend"}
    
    async def _handle_get_status(self, **kwargs) -> Dict[str, Any]:
        """Get detailed backend status for diagnostics."""
        try:
            browser_binary_path = self._find_available_browser_binary()
            status = {
                "status": "ok",
                "service": "local_backend",
                "running": self.running,
                "memory_store_initialized": self.memory_store is not None,
                "tool_registry_initialized": hasattr(self, 'tool_registry') and self.tool_registry is not None,
                "semantic_summarizer_enabled": self._semantic_summarizer_enabled,
                "browser_feature_pack_available": is_feature_pack_available("browser"),
                "browser_feature_pack_autoinstall_enabled": (
                    self._browser_feature_pack_autoinstall_enabled
                ),
                "browser_binary_available": browser_binary_path is not None,
                "browser_binary_path": browser_binary_path,
                "playwright_browsers_path": str(self._resolve_playwright_browsers_path()),
                "runtime_dependency_warnings": list(self._runtime_dependency_warnings),
            }
            
            if self.tool_registry:
                status["registered_tools"] = list(self.tool_registry.tools.keys())
                status["tool_count"] = len(self.tool_registry.tools)
            
            if self.memory_store:
                try:
                    # Quick test to see if memory store is functional
                    status["memory_store_status"] = "operational"
                except Exception as e:
                    status["memory_store_status"] = f"error: {str(e)}"
            else:
                if self._memory_store_unavailable_error:
                    status["memory_store_status"] = self._memory_store_unavailable_error
                else:
                    status["memory_store_status"] = "not_initialized"
            
            return status
        except Exception as e:
            logger.error(f"Status check failed: {e}", exc_info=True)
            return {
                "status": "error",
                "error": str(e)
            }

    async def _handle_install_browser_chromium(self, **kwargs) -> Dict[str, Any]:
        """Ensure Chromium is available for browser automation."""
        existing_browser_path = self._find_available_browser_binary()
        if existing_browser_path:
            return {
                "success": True,
                "installed": False,
                "skipped": True,
                "reason": "Browser binary already available.",
                "browser_binary_path": existing_browser_path,
                "playwright_browsers_path": str(self._resolve_playwright_browsers_path()),
            }

        setup_error = await self._ensure_browser_tool_ready()
        if setup_error:
            return {
                "success": False,
                "error": setup_error,
                "installed": False,
            }

        existing_browser_path = self._find_available_browser_binary()
        if existing_browser_path:
            return {
                "success": True,
                "installed": False,
                "skipped": True,
                "reason": "Browser binary became available during browser feature-pack setup.",
                "browser_binary_path": existing_browser_path,
                "playwright_browsers_path": str(self._resolve_playwright_browsers_path()),
            }

        playwright_browsers_path = self._resolve_playwright_browsers_path()
        playwright_browsers_path.mkdir(parents=True, exist_ok=True)

        try:
            install_result = await asyncio.to_thread(
                subprocess.run,
                [sys.executable, "-m", "playwright", "install", "chromium"],
                capture_output=True,
                text=True,
                timeout=CHROMIUM_INSTALL_TIMEOUT_SECONDS,
                env={
                    **os.environ,
                    "PLAYWRIGHT_BROWSERS_PATH": str(playwright_browsers_path),
                },
            )
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": (
                    "Timed out while installing Chromium runtime "
                    f"after {CHROMIUM_INSTALL_TIMEOUT_SECONDS} seconds."
                ),
                "installed": False,
            }
        except Exception as exc:
            return {
                "success": False,
                "error": f"Chromium install failed: {exc}",
                "installed": False,
            }

        if install_result.returncode != 0:
            error_detail = (install_result.stderr or install_result.stdout or "").strip()
            return {
                "success": False,
                "error": (
                    "Chromium install command failed."
                    + (f" {error_detail}" if error_detail else "")
                ),
                "installed": False,
                "returncode": install_result.returncode,
            }

        installed_browser_path = self._find_available_browser_binary()
        if not installed_browser_path:
            return {
                "success": False,
                "error": "Chromium install completed but no browser binary was detected afterward.",
                "installed": False,
                "returncode": install_result.returncode,
            }

        return {
            "success": True,
            "installed": True,
            "skipped": False,
            "browser_binary_path": installed_browser_path,
            "playwright_browsers_path": str(playwright_browsers_path),
        }
    
    async def _handle_execute_tool(self, tool_name: str, args: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """
        Execute a tool.
        
        Args:
            tool_name: Name of the tool to execute
            args: Tool arguments
        """
        try:
            if tool_name == "browser":
                browser_setup_error = await self._ensure_browser_tool_ready()
                if browser_setup_error:
                    return {
                        "success": False,
                        "error": browser_setup_error,
                    }

            result = await self.tool_registry.execute_tool(tool_name, args)
            # Convert ToolResult to dict for JSON-RPC response
            return result.to_dict()
        except Exception as e:
            logger.error(f"Tool execution error: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Tool execution failed: {str(e)}"
            }
    
    async def _handle_get_system_state(self, fields: Optional[list] = None, **kwargs) -> Dict[str, Any]:
        """Get system state with optional field selection."""
        try:
            from core.system_state import get_system_state
            
            state = await get_system_state(fields=fields)
            return {
                "success": True,
                "data": state
            }
        except BaseException as e:
            logger.error(f"Failed to get system state: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def run(self) -> None:
        """Run the main event loop."""
        self.running = True
        logger.info("Starting local backend main loop...")
        
        try:
            while self.running:
                # Read JSON-RPC message from stdin (one line per message)
                try:
                    line = await asyncio.to_thread(sys.stdin.readline)
                except (OSError, ValueError):
                    if self._shutdown_requested or not self.running:
                        break
                    raise
                
                if not line:
                    # EOF - exit
                    break
                
                # Process the line
                response = await self.protocol.process_line(line)
                
                if response:
                    self.protocol.send_response(response)
        
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        except Exception as e:
            logger.error(f"Error in main loop: {e}", exc_info=True)
        finally:
            await self.shutdown()

    def request_shutdown(self, signum: Optional[int] = None) -> None:
        """Request graceful shutdown, optionally from a signal handler."""
        request_stdin_shutdown(self, logger, signum)
    
    async def shutdown(self) -> None:
        """Shutdown the service gracefully."""
        logger.info("Shutting down local backend...")
        self.running = False

        if self._summarizer:
            try:
                await self._summarizer.stop()
                logger.info("Memory summarizer stopped")
            except Exception as e:
                logger.warning(f"Failed to stop memory summarizer: {e}")

        if self.memory_store:
            await self.memory_store.close()
            logger.info("Memory store closed")

        shutdown_all_executors(wait=True)
        
        logger.info("Local backend shutdown complete")


def signal_handler(signum, frame):
    """Handle system signals for graceful shutdown."""
    if handle_shutdown_signal(signum, _active_backend, logger):
        return
    raise KeyboardInterrupt


async def main():
    """Main entry point."""
    global _active_backend
    # Set up signal handlers
    register_shutdown_signal_handlers(signal_handler)
    
    # Create and run the service
    backend = LocalBackend()
    _active_backend = backend
    
    try:
        await backend.initialize()
        await backend.run()
    except Exception as e:
        logger.error(f"Service failed: {e}", exc_info=True)
        sys.exit(1)
    finally:
        _active_backend = None


if __name__ == "__main__":
    # Run the async main function
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Service terminated by user")
    except Exception as e:
        logger.error(f"Service crashed: {e}", exc_info=True)
        sys.exit(1)
