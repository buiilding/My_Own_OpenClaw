"""
Persistent Shell Manager for true persistent terminal sessions (Cross-Platform).

This module implements robust persistent shell sessions for both Unix (using PTY)
and Windows (using named pipes and threads).

Features:
1. True interactive shell behavior (maintaining state, variables, aliases)
2. Proper handling of standard I/O streams
3. Reliable command completion detection
"""
import logging
import os
import platform
import re
import subprocess
import threading
import time
import uuid
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from queue import Queue, Empty
from typing import Dict, List, Optional, Tuple, Union

# Platform-specific imports
if platform.system() == "Windows":
    import msvcrt
else:
    import fcntl
    import pty
    import select
    import struct
    import termios

logger = logging.getLogger(__name__)

# Constants
READ_TIMEOUT = 0.1
ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')


@dataclass(frozen=True)
class SessionKey:
    """Immutable session key for shell sessions.
    
    Provides type-safe key construction and prevents ordering mistakes.
    """
    user_id: str
    session_id: str
    
    def __str__(self) -> str:
        """Convert to string format for dict keys."""
        return f"{self.user_id}:{self.session_id}"
    
    @classmethod
    def from_string(cls, key_str: str) -> "SessionKey":
        """
        Parse key string (for backward compatibility).
        
        Args:
            key_str: String in format "user_id:session_id"
            
        Returns:
            SessionKey instance
            
        Raises:
            ValueError: If key format is invalid
        """
        parts = key_str.split(":", 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid session key format: {key_str}")
        return cls(user_id=parts[0], session_id=parts[1])


@dataclass
class ShellSession:
    """Represents a single persistent shell session."""
    session_id: str
    user_id: str
    process: subprocess.Popen
    delimiter: str
    working_dir: str
    command_history: deque = field(default_factory=lambda: deque(maxlen=100))
    lock: threading.Lock = field(default_factory=threading.Lock)
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    
    # Platform specific fields
    master_fd: Optional[int] = None  # Unix only
    output_queue: Optional[Queue] = None  # Windows only
    last_exit_code: Optional[int] = None  # Windows: stores exit code from last command

    def close(self):
        """Clean up resources."""
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
        
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                try:
                    self.process.kill()
                except OSError:
                    pass


class BaseShellManager(ABC):
    """Abstract base class for shell managers."""
    
    def __init__(self):
        self._sessions: Dict[str, ShellSession] = {}
        self._lock = threading.Lock()

    def get_session(self, session_id: str, user_id: str) -> Optional[ShellSession]:
        key = self._get_key(session_id, user_id)
        return self._sessions.get(str(key))
        
    def _get_key(self, session_id: str, user_id: str) -> SessionKey:
        """Create type-safe session key."""
        return SessionKey(user_id=user_id, session_id=session_id)
    
    def cleanup_shell(self, session_id: str, user_id: str) -> None:
        """
        Clean up and remove a shell session.
        
        Args:
            session_id: Session ID
            user_id: User ID
        """
        key = self._get_key(session_id, user_id)
        key_str = str(key)
        
        with self._lock:
            session = self._sessions.get(key_str)
            if session:
                session.close()
                del self._sessions[key_str]
                logger.debug(f"Cleaned up shell session {key_str}")

    @abstractmethod
    def create_session(self, session_id: str, user_id: str, working_dir: Optional[str] = None) -> ShellSession:
        pass

    def execute_command(self, session_id: str, user_id: str, command: str, timeout: float = 30.0, working_dir: Optional[str] = None) -> Tuple[str, str, int, bool]:
        """
        Execute a command in a persistent shell session.
        
        Shared implementation that handles session management, working directory,
        timeout, and command history. Platform-specific I/O is delegated to
        abstract methods.
        """
        # Get or create session
        session = self.get_session(session_id, user_id)
        
        if not session or (session.process.poll() is not None):
            session = self.create_session(session_id, user_id, working_dir)
        
        with session.lock:
            # Handle working directory change if needed
            if working_dir and working_dir != session.working_dir:
                self._send_command(session, self._get_cd_command(working_dir), timeout=5.0)
                session.working_dir = working_dir

            # Execute command (platform-specific)
            output, timed_out = self._send_command(session, command, timeout)
            
            # Handle timeout
            if timed_out:
                session.close()
                key = self._get_key(session_id, user_id)
                key_str = str(key)
                if key_str in self._sessions:
                    del self._sessions[key_str]
                return output, "Command timed out", -1, True

            # Get exit code (platform-specific)
            exit_code = self._get_exit_code(session)
            
            # Update working directory for 'cd' commands
            # Parse cd command directly instead of querying shell
            if command.strip().lower().startswith("cd "):
                new_dir = self._parse_cd_command(command, session.working_dir)
                if new_dir:
                    # Validate directory exists before updating
                    import os
                    if os.path.exists(new_dir) and os.path.isdir(new_dir):
                        session.working_dir = new_dir
                    else:
                        logger.warning(f"cd to invalid directory: {new_dir}")

            # Update session state (shared)
            session.last_activity = time.time()
            session.command_history.append(command)
            
            return self._clean_output(output, command.strip()), "", exit_code, False

    @abstractmethod
    def _send_command(self, session: ShellSession, command: str, timeout: float) -> Tuple[str, bool]:
        """
        Send a command to the shell session and read output.
        
        Platform-specific implementation for command execution.
        
        Args:
            session: Shell session
            command: Command to execute
            timeout: Timeout in seconds
            
        Returns:
            Tuple of (output, timed_out)
        """
        pass
    
    @abstractmethod
    def _get_exit_code(self, session: ShellSession) -> int:
        """
        Get the exit code of the last command.
        
        Platform-specific implementation.
        
        Args:
            session: Shell session
            
        Returns:
            Exit code (0 for success, -1 if unable to determine)
        """
        pass
    
    def _parse_cd_command(self, command: str, current_dir: str) -> Optional[str]:
        """
        Parse cd command to extract target directory.
        
        Handles:
        - cd /absolute/path
        - cd relative/path
        - cd ~ (home directory)
        - cd - (previous directory - not supported, returns None)
        - cd (home directory)
        
        Args:
            command: cd command string
            current_dir: Current working directory
            
        Returns:
            Resolved directory path, or None if unable to parse
        """
        import os
        
        # Extract directory from command
        parts = command.strip().split(maxsplit=1)
        if len(parts) < 2:
            # cd without arguments -> home directory
            return os.path.expanduser("~")
        
        target = parts[1].strip()
        
        # Handle special cases
        if target == "-":
            # Previous directory - not supported
            return None
        
        if target == "~" or target.startswith("~/"):
            # Home directory
            return os.path.expanduser(target)
        
        # Resolve path (handles both absolute and relative)
        if os.path.isabs(target):
            return target
        else:
            return os.path.normpath(os.path.join(current_dir, target))
    
    @abstractmethod
    def _get_current_directory(self, session: ShellSession) -> Optional[str]:
        """
        Get the current working directory from the shell session.
        
        Platform-specific implementation. Used as fallback when cd parsing fails.
        
        Args:
            session: Shell session
            
        Returns:
            Current directory path, or None if unable to determine
        """
        pass
    
    def _get_cd_command(self, directory: str) -> str:
        """
        Get platform-specific cd command.
        
        Args:
            directory: Directory path
            
        Returns:
            cd command string
        """
        # Default Unix-style, Windows overrides
        return f"cd {directory}"

    def _clean_output(self, output: str, command: str) -> str:
        """Clean raw shell output."""
        # Remove ANSI codes
        cleaned = ANSI_ESCAPE.sub('', output)
        cleaned = cleaned.strip()
        
        # Remove echoed command if present at start
        if cleaned.startswith(command):
            cleaned = cleaned[len(command):].strip()
            
        return cleaned


class UnixShellManager(BaseShellManager):
    """Unix implementation using PTY."""

    def create_session(self, session_id: str, user_id: str, working_dir: Optional[str] = None) -> ShellSession:
        key = self._get_key(session_id, user_id)
        
        with self._lock:
            if key in self._sessions:
                self._sessions[key].close()
            
            master_fd, slave_fd = pty.openpty()
            delimiter = f"__CTX_SHELL_END_{uuid.uuid4().hex[:8]}__"
            
            env = os.environ.copy()
            env["TERM"] = "dumb"
            env["PS1"] = f"\n{delimiter}\n"
            
            process = subprocess.Popen(
                ["/bin/bash", "--noprofile", "--norc"],
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                cwd=working_dir or os.getcwd(),
                env=env,
                preexec_fn=os.setsid,
                bufsize=0
            )
            
            os.close(slave_fd)
            
            fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
            fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
            
            # Set generic window size
            winsize = struct.pack("HHHH", 24, 120, 0, 0)
            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)

            session = ShellSession(
                session_id=session_id,
                user_id=user_id,
                process=process,
                master_fd=master_fd,
                delimiter=delimiter,
                working_dir=working_dir or os.getcwd()
            )
            
            self._initialize_session(session)
            self._sessions[str(key)] = session
            return session

    def _send_command(self, session: ShellSession, command: str, timeout: float) -> Tuple[str, bool]:
        self._read_available(session.master_fd)
        
        if not command.endswith('\n'):
            command += '\n'
        os.write(session.master_fd, command.encode())
        
        output = []
        start_time = time.time()
        buffer = ""
        
        while (time.time() - start_time) < timeout:
            chunk = self._read_available(session.master_fd)
            if chunk:
                buffer += chunk
                if session.delimiter in buffer:
                    parts = buffer.split(session.delimiter)
                    content = parts[0]
                    return self._clean_output(content, command.strip()), False
            
            time.sleep(0.01)
            
        return self._clean_output(buffer, command.strip()), True
    
    def _get_exit_code(self, session: ShellSession) -> int:
        """Get exit code using Unix echo $? command."""
        code_out, _ = self._send_command(session, "echo $?", timeout=2.0)
        try:
            return int(code_out.strip())
        except (ValueError, TypeError):
            return -1
    
    def _get_current_directory(self, session: ShellSession) -> Optional[str]:
        """Get current directory using Unix pwd command."""
        pwd_out, _ = self._send_command(session, "pwd", timeout=2.0)
        return pwd_out.strip() if pwd_out else None

    def _read_available(self, fd: int) -> str:
        out = b""
        while True:
            try:
                r, _, _ = select.select([fd], [], [], 0)
                if not r:
                    break
                chunk = os.read(fd, 10240)
                if not chunk:
                    break
                out += chunk
            except OSError:
                break
        return out.decode('utf-8', errors='replace')

    def _initialize_session(self, session: ShellSession):
        time.sleep(0.1)
        self._read_available(session.master_fd)
        self._send_command(session, "stty -echo", timeout=2.0)
        self._read_available(session.master_fd)


class WindowsShellManager(BaseShellManager):
    """Windows implementation using subprocess pipes and threads."""

    def create_session(self, session_id: str, user_id: str, working_dir: Optional[str] = None) -> ShellSession:
        key = self._get_key(session_id, user_id)
        
        with self._lock:
            if key in self._sessions:
                self._sessions[key].close()
            
            delimiter = f"__CTX_END_{uuid.uuid4().hex[:8]}__"
            
            # Start PowerShell with UTF8 encoding forced
            # We use -NoExit to keep session alive
            # We assume 'powershell.exe' is in PATH
            process = subprocess.Popen(
                ["powershell.exe", "-NoLogo", "-NoExit", "-Command", "-"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Merge stderr for simplicity
                text=True,
                cwd=working_dir or os.getcwd(),
                bufsize=1,  # Line buffered
                encoding='utf-8'
            )
            
            # Setup output consumption
            output_queue = Queue()
            
            def reader_thread(proc, q):
                """Reads stdout from process and puts into queue."""
                while True:
                    try:
                        # Read char by char to ensure we catch the delimiter even without newline
                        # (though we append newline in delimiter usually)
                        char = proc.stdout.read(1)
                        if not char:
                            break
                        q.put(char)
                    except ValueError:
                        break
                    except Exception as e:
                        logger.error(f"Windows shell reader error: {e}")
                        break

            t = threading.Thread(target=reader_thread, args=(process, output_queue), daemon=True)
            t.start()

            session = ShellSession(
                session_id=session_id,
                user_id=user_id,
                process=process,
                delimiter=delimiter,
                working_dir=working_dir or os.getcwd(),
                output_queue=output_queue
            )
            
            # Initial setup: set encoding and clear initial output
            # We don't read initial banner here because our execute_command relies on fresh delimiter injection
            # But good to set encoding explicitly again just in case
            self._send_command(session, "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8", 5.0)
            
            self._sessions[str(key)] = session
            return session

    def _get_cd_command(self, directory: str) -> str:
        """Get Windows-style cd command with quotes."""
        return f"cd '{directory}'"
    
    def _send_command(self, session: ShellSession, command: str, timeout: float) -> Tuple[str, bool]:
        """
        Send command to Windows PowerShell and read output.
        
        For main command execution, wraps command to include delimiter and exit code.
        For helper commands, just includes delimiter.
        """
        # Check if this is a helper command (doesn't need exit code capture)
        is_helper = command.strip().lower() in ["write-output $lastexitcode", "get-location | select-object -expandproperty path"]
        
        if is_helper:
            # Simple send and wait for delimiter
            wrapped_cmd = f"{command}\nWrite-Output '{session.delimiter}'"
        else:
            # Main command - wrap to capture exit code
            wrapped_cmd = f"{command}\nWrite-Output '{session.delimiter}'\nWrite-Output $LASTEXITCODE"
        
        # Clear queue
        while not session.output_queue.empty():
            try:
                session.output_queue.get_nowait()
            except Empty:
                break
            
        try:
            session.process.stdin.write(wrapped_cmd + "\n")
            session.process.stdin.flush()
        except OSError:
            return "", True  # Process died, treat as timeout
        
        buf = ""
        start = time.time()
        found_delimiter = False
        
        while (time.time() - start) < timeout:
            try:
                c = session.output_queue.get(timeout=0.1)
                buf += c
                if session.delimiter in buf:
                    found_delimiter = True
                    break
            except Empty:
                continue
        
        if not found_delimiter:
            return buf, True  # Timeout
        
        # Parse output
        parts = buf.split(session.delimiter)
        output = parts[0].strip()
        
        # Extract exit code if this was a main command
        if not is_helper and len(parts) > 1:
            exit_code_str = parts[1].strip()
            try:
                import re
                matches = re.findall(r'\d+', exit_code_str)
                session.last_exit_code = int(matches[0]) if matches else 0
            except (ValueError, TypeError):
                session.last_exit_code = 0
        
        return output, False
    
    def _get_exit_code(self, session: ShellSession) -> int:
        """
        Get exit code from Windows PowerShell.
        
        The exit code is captured by _send_command() and stored in session.last_exit_code.
        """
        # Exit code was captured during _send_command execution
        return session.last_exit_code if session.last_exit_code is not None else 0
    
    def _get_current_directory(self, session: ShellSession) -> Optional[str]:
        """Get current directory using Windows Get-Location command."""
        pwd_out, _ = self._send_command(session, "Get-Location | Select-Object -ExpandProperty Path", timeout=2.0)
        return pwd_out.strip() if pwd_out else None


# Global Factory
_shell_manager = None

def get_shell_manager() -> Union[UnixShellManager, WindowsShellManager]:
    """Singleton accessor returning platform-appropriate manager."""
    global _shell_manager
    if _shell_manager is None:
        if platform.system() == "Windows":
            _shell_manager = WindowsShellManager()
        else:
            _shell_manager = UnixShellManager()
    return _shell_manager

