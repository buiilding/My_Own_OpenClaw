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
        return self._sessions.get(key)
        
    def _get_key(self, session_id: str, user_id: str) -> str:
        return f"{user_id}:{session_id}"

    @abstractmethod
    def create_session(self, session_id: str, user_id: str, working_dir: Optional[str] = None) -> ShellSession:
        pass

    @abstractmethod
    def execute_command(self, session_id: str, user_id: str, command: str, timeout: float = 30.0, working_dir: Optional[str] = None) -> Tuple[str, str, int, bool]:
        pass

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
            self._sessions[key] = session
            return session

    def execute_command(self, session_id: str, user_id: str, command: str, timeout: float = 30.0, working_dir: Optional[str] = None) -> Tuple[str, str, int, bool]:
        session = self.get_session(session_id, user_id)
        
        if not session or (session.process.poll() is not None):
            session = self.create_session(session_id, user_id, working_dir)
        
        with session.lock:
            if working_dir and working_dir != session.working_dir:
                self._send_command(session, f"cd {working_dir}", timeout=5.0)
                session.working_dir = working_dir

            output, timed_out = self._send_command(session, command, timeout)
            
            if timed_out:
                session.close()
                key = self._get_key(session_id, user_id)
                if key in self._sessions:
                    del self._sessions[key]
                return output, "Command timed out", -1, True

            # Get exit code
            code_out, _ = self._send_command(session, "echo $?", timeout=2.0)
            try:
                exit_code = int(code_out.strip())
            except (ValueError, TypeError):
                exit_code = -1

            if command.strip().startswith("cd "):
                 pwd_out, _ = self._send_command(session, "pwd", timeout=2.0)
                 if pwd_out:
                     session.working_dir = pwd_out.strip()

            session.last_activity = time.time()
            session.command_history.append(command)
            
            return output, "", exit_code, False

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
            
            self._sessions[key] = session
            return session

    def execute_command(self, session_id: str, user_id: str, command: str, timeout: float = 30.0, working_dir: Optional[str] = None) -> Tuple[str, str, int, bool]:
        session = self.get_session(session_id, user_id)
        
        if not session or (session.process.poll() is not None):
            session = self.create_session(session_id, user_id, working_dir)
        
        with session.lock:
            if working_dir and working_dir != session.working_dir:
                self._send_command(session, f"cd '{working_dir}'", timeout=5.0)
                session.working_dir = working_dir

            # Wrapped command to print delimiter
            # We also capture $LASTEXITCODE
            wrapped_cmd = f"{command}\nWrite-Output '{session.delimiter}'\nWrite-Output $LASTEXITCODE"
            
            # Flush queue before command
            while not session.output_queue.empty():
                try:
                    session.output_queue.get_nowait()
                except Empty:
                    break

            # Send command
            try:
                session.process.stdin.write(wrapped_cmd + "\n")
                session.process.stdin.flush()
            except OSError:
                return "", "Shell process died", -1, False

            # Read until delimiter
            output_buffer = ""
            start_time = time.time()
            found_delimiter = False
            
            while (time.time() - start_time) < timeout:
                try:
                    char = session.output_queue.get(timeout=0.1)
                    output_buffer += char
                    
                    if session.delimiter in output_buffer:
                        found_delimiter = True
                        # We still need to read the exit code which comes AFTER delimiter
                        # The delimiter logic in the loop below handles it
                        break
                except Empty:
                    continue
            
            if not found_delimiter:
                # Timeout
                session.close()
                if key := self._get_key(session_id, user_id) in self._sessions:
                    del self._sessions[key]
                return output_buffer, "Command timed out", -1, True

            # Parse output
            # Format: <output> <delimiter> \n <exit_code> \n ...
            parts = output_buffer.split(session.delimiter)
            raw_output = parts[0]
            
            # Now we need to read the exit code
            # It should be in the queue or coming very soon
            exit_code_buffer = ""
            # Read remaining lines for exit code
            # We expect just one number
            
            # Quick read for exit code
            sub_start = time.time()
            while (time.time() - sub_start) < 2.0:
                try:
                    char = session.output_queue.get(timeout=0.1)
                    exit_code_buffer += char
                    if '\n' in exit_code_buffer.strip(): 
                         # Got a line
                         break
                except Empty:
                    # If we have something that looks like a number, maybe that's it
                    if exit_code_buffer.strip().isdigit():
                        break
            
            try:
                # Extract first number found after delimiter
                import re
                matches = re.findall(r'\d+', exit_code_buffer)
                exit_code = int(matches[0]) if matches else 0
            except:
                exit_code = 0 # Default success if we can't parse, or -1? 0 is safer for "echo" style

            # Update working dir tracking
            if command.strip().lower().startswith("cd "):
                 # On Windows, we need to ask for location
                 # We do a quick separate call
                 # But we can't easily nest calls inside execute_command due to lock re-entrancy
                 # So we manually write to stdin
                 session.process.stdin.write("Get-Location | Select-Object -ExpandProperty Path\nWrite-Output '" + session.delimiter + "'\n")
                 session.process.stdin.flush()
                 
                 # Read pwd
                 pwd_buf = ""
                 while True:
                     try:
                         c = session.output_queue.get(timeout=1.0)
                         pwd_buf += c
                         if session.delimiter in pwd_buf:
                             session.working_dir = pwd_buf.split(session.delimiter)[0].strip()
                             break
                     except Empty:
                         break

            session.last_activity = time.time()
            session.command_history.append(command)

            return self._clean_output(raw_output, command.strip()), "", exit_code, False
            
    def _send_command(self, session: ShellSession, command: str, timeout: float) -> Tuple[str, bool]:
        """Helper for internal commands."""
        # Simple send and wait for delimiter
        wrapped_cmd = f"{command}\nWrite-Output '{session.delimiter}'"
        
        # Clear queue
        while not session.output_queue.empty():
            session.output_queue.get_nowait()
            
        session.process.stdin.write(wrapped_cmd + "\n")
        session.process.stdin.flush()
        
        buf = ""
        start = time.time()
        while (time.time() - start) < timeout:
            try:
                c = session.output_queue.get(timeout=0.1)
                buf += c
                if session.delimiter in buf:
                    return buf.split(session.delimiter)[0].strip(), False
            except Empty:
                continue
                
        return buf, True


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

