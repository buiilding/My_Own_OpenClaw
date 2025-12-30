"""
Windows Shell Session Implementation.

Uses PowerShell with proper subprocess handling and prompt detection.
"""
import logging
import os
import subprocess
import threading
import time
import uuid
import queue
import asyncio
from typing import Optional, Tuple

from backend.src.services.shell.interface import ShellSession, ShellResult

logger = logging.getLogger(__name__)


class WindowsShellSession(ShellSession):
    """
    Windows shell session using PowerShell.
    
    Maintains a persistent PowerShell session by detecting the prompt,
    avoiding command injection delimiter hacks.
    """
    
    def __init__(self, session_id: str, user_id: str, working_dir: Optional[str] = None):
        """Initialize Windows shell session."""
        super().__init__(session_id, user_id, working_dir)
        self._process: Optional[subprocess.Popen] = None
        self._output_queue: Optional[queue.Queue] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._prompt = f"__PS_PROMPT_{uuid.uuid4().hex[:8]}__"
        self._lock = asyncio.Lock()
        self._closed = False
    
    async def _ensure_session(self):
        """Ensure shell session exists and is ready."""
        if self._process is not None and self._process.poll() is None:
            return
            
        def spawn_shell():
            # Start PowerShell
            # -NoProfile: No user profile
            # -NoLogo: Hide copyright banner
            # -NoExit: Don't exit after running start commands
            # -Command -: Read commands from stdin
            # Force UTF-8 encoding for reliable output
            
            startup_commands = [
                f'[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
                f'function prompt {{ Write-Host "{self._prompt}" -NoNewline; return " " }}',
            ]
            
            # Create process
            process = subprocess.Popen(
                ["powershell.exe", "-NoProfile", "-NoLogo", "-NoExit", "-Command", "-"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout
                text=False, # Binary mode to avoid buffering issues
                cwd=self.working_dir or os.getcwd(),
                bufsize=0   # Unbuffered
            )
            
            output_queue = queue.Queue()
            
            def reader():
                """Reads stdout byte by byte."""
                while True:
                    try:
                        if process.poll() is not None:
                            break
                        char = process.stdout.read(1)
                        if not char:
                            break
                        output_queue.put(char)
                    except Exception:
                        break
            
            t = threading.Thread(target=reader, daemon=True)
            t.start()
            
            self._process = process
            self._output_queue = output_queue
            self._reader_thread = t
            self._closed = False
            
            # Send startup commands
            for cmd in startup_commands:
                self._send_raw(cmd)
                # Consume output until prompt for each startup command
                # This ensures we are in a clean state
                self._read_until_prompt(timeout=5.0)
                
            return True

        await self._run_in_executor(spawn_shell)
        logger.info(f"Started Windows shell session {self.session_id}")
    
    def _send_raw(self, command: str):
        """Send raw command to stdin."""
        if not self._process:
            raise RuntimeError("Shell process not initialized")
        
        # Append newline
        data = (command + "\n").encode('utf-8')
        try:
            self._process.stdin.write(data)
            self._process.stdin.flush()
        except OSError:
            pass

    def _read_until_prompt(self, timeout: float = 30.0) -> str:
        """Read output until prompt is seen."""
        buffer = b""
        prompt_bytes = self._prompt.encode('utf-8')
        start_time = time.time()
        
        while (time.time() - start_time) < timeout:
            try:
                # Read with short timeout to check total timeout
                char = self._output_queue.get(timeout=0.1)
                buffer += char
                
                # Check for prompt at end of buffer
                if buffer.endswith(prompt_bytes):
                    # Return everything before the prompt
                    return buffer[:-len(prompt_bytes)].decode('utf-8', errors='replace').strip()
                    
            except queue.Empty:
                continue
        
        raise TimeoutError("Timed out waiting for prompt")

    async def execute(self, command: str, timeout: float) -> ShellResult:
        """
        Execute command in Windows shell.
        """
        async with self._lock:
            await self._ensure_session()
            
            def run_command():
                try:
                    self._send_raw(command)
                    output = self._read_until_prompt(timeout)
                    return output, None
                except TimeoutError:
                    return "", "Timeout"
                except Exception as e:
                    return "", str(e)
            
            output, error = await self._run_in_executor(run_command)
            
            if error == "Timeout":
                 return ShellResult(
                    output=output,
                    error="Command timed out",
                    exit_code=-1,
                    timed_out=True
                )
            
            if error:
                 return ShellResult(
                    output=output,
                    error=error,
                    exit_code=-1,
                    timed_out=False
                )

            # Get exit code
            # Since the previous command finished (we saw prompt), $LASTEXITCODE is set
            def get_code():
                try:
                    self._send_raw("Write-Output $LASTEXITCODE")
                    code_out = self._read_until_prompt(timeout=5.0)
                    return int(code_out.strip())
                except:
                    return -1
            
            exit_code = await self._run_in_executor(get_code)
            
            # Handle cd updates
            if command.strip().lower().startswith("cd "):
                 await self._update_working_directory()

            return ShellResult(
                output=output,
                error=None,
                exit_code=exit_code,
                timed_out=False
            )
    
    async def get_exit_code(self) -> int:
        """Get exit code of last command."""
        # Note: This executes a new command to get the value
        async with self._lock:
            await self._ensure_session()
            def get_code():
                try:
                    self._send_raw("Write-Output $LASTEXITCODE")
                    code_out = self._read_until_prompt(timeout=5.0)
                    return int(code_out.strip())
                except:
                    return -1
            return await self._run_in_executor(get_code)
    
    async def get_working_directory(self) -> str:
        """Get current working directory."""
        async with self._lock:
            await self._ensure_session()
            def get_pwd():
                try:
                    self._send_raw("Get-Location | Select-Object -ExpandProperty Path")
                    pwd = self._read_until_prompt(timeout=5.0)
                    return pwd.strip()
                except:
                    return ""
            
            cwd = await self._run_in_executor(get_pwd)
            if cwd:
                self.working_dir = cwd
                return cwd
            return self.working_dir or os.getcwd()

    async def _update_working_directory(self):
        """Update cached working directory."""
        def get_pwd():
            try:
                self._send_raw("Get-Location | Select-Object -ExpandProperty Path")
                pwd = self._read_until_prompt(timeout=5.0)
                return pwd.strip()
            except:
                return ""
        
        cwd = await self._run_in_executor(get_pwd)
        if cwd:
            self.working_dir = cwd

    async def change_directory(self, directory: str) -> bool:
        """Change working directory."""
        # Use quotes for Windows paths
        result = await self.execute(f"cd '{directory}'", timeout=5.0)
        return result.exit_code == 0
    
    async def close(self) -> None:
        """Close shell session."""
        self._closed = True
        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=1)
            except:
                try:
                    self._process.kill()
                except:
                    pass
            self._process = None

    async def _run_in_executor(self, func, *args):
        """Run blocking function in executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, func, *args)
