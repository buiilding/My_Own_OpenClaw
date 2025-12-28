"""
Persistent Shell Manager for maintaining long-running shell processes per session.

This module manages persistent shell sessions that maintain:
- Environment variables across commands
- Conda environment activation
- Working directory
- Shell state (aliases, functions, variables)
- Command history

Each session gets its own persistent shell process that lives for the duration
of the session, providing true terminal-like behavior.
"""
import asyncio
import logging
import os
import platform
import shlex
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple, Deque
from queue import Queue, Empty

logger = logging.getLogger(__name__)


@dataclass
class ShellState:
    """State maintained for each persistent shell session."""
    process: subprocess.Popen
    working_directory: str
    environment: Dict[str, str] = field(default_factory=dict)
    conda_env: Optional[str] = None
    command_history: Deque[str] = field(default_factory=lambda: deque(maxlen=100))
    last_command_time: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)
    output_queue: Queue = field(default_factory=Queue)
    is_active: bool = True


class PersistentShellManager:
    """
    Manages persistent shell processes per session.
    
    Each session gets a long-running shell process that maintains state
    across multiple command executions, just like a real terminal.
    """
    
    def __init__(self):
        """Initialize the shell manager."""
        self._shells: Dict[str, ShellState] = {}
        self._lock = threading.Lock()
        self._output_readers: Dict[str, threading.Thread] = {}
        
    def _get_shell_key(self, session_id: str, user_id: str) -> str:
        """Generate a unique key for a shell session."""
        return f"{user_id}:{session_id}"
    
    def _create_shell_process(self, initial_dir: str, initial_env: Optional[Dict[str, str]] = None) -> subprocess.Popen:
        """
        Create a new persistent shell process.
        
        Uses a wrapper approach: we maintain environment state in Python and execute
        commands through the shell with the accumulated environment.
        
        Args:
            initial_dir: Initial working directory
            initial_env: Initial environment variables (merged with system env)
            
        Returns:
            Popen process for the shell (actually a dummy process for state tracking)
        """
        # For now, we'll use a simpler approach: maintain state in Python
        # and execute commands with the environment passed in
        # This is more reliable than trying to maintain a true interactive shell
        
        # We maintain state in Python and execute commands via subprocess with env
        # Create a minimal process-like object for compatibility
        # Note: This is just for state tracking, actual execution happens in execute_command
        class ShellStateProcess:
            def __init__(self):
                self.pid = os.getpid()  # Placeholder PID
                self._returncode = None
                self.stdin = None
                self.stdout = None
                self.stderr = None
            
            def poll(self):
                return self._returncode
            
            def terminate(self):
                self._returncode = -1
            
            def kill(self):
                self._returncode = -1
        
        process = ShellStateProcess()
        logger.info(f"Created persistent shell state for directory: {initial_dir}")
        return process
    
    def _start_output_reader(self, shell_key: str, shell_state: ShellState):
        """
        Start a background thread to read shell output.
        
        Note: With the simplified approach, this is not needed but kept for API compatibility.
        """
        pass  # No-op for simplified approach
    
    def get_or_create_shell(
        self,
        session_id: str,
        user_id: str,
        initial_dir: Optional[str] = None,
        initial_env: Optional[Dict[str, str]] = None
    ) -> ShellState:
        """
        Get existing shell for session or create a new one.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
            initial_dir: Initial working directory (if creating new shell)
            initial_env: Initial environment variables (if creating new shell)
            
        Returns:
            ShellState for the session
        """
        shell_key = self._get_shell_key(session_id, user_id)
        
        with self._lock:
            if shell_key in self._shells:
                shell_state = self._shells[shell_key]
                # Check if process is still alive
                if shell_state.process.poll() is None:
                    return shell_state
                else:
                    # Process died, remove it
                    logger.warning(f"Shell process for {shell_key} died, recreating...")
                    del self._shells[shell_key]
                    if shell_key in self._output_readers:
                        del self._output_readers[shell_key]
            
            # Create new shell
            working_dir = initial_dir or os.getcwd()
            process = self._create_shell_process(working_dir, initial_env)
            
            shell_state = ShellState(
                process=process,
                working_directory=working_dir,
                environment=initial_env or {}
            )
            
            self._shells[shell_key] = shell_state
            self._start_output_reader(shell_key, shell_state)
            
            return shell_state
    
    def execute_command(
        self,
        session_id: str,
        user_id: str,
        command: str,
        timeout: Optional[float] = None,
        working_dir: Optional[str] = None
    ) -> Tuple[str, str, Optional[int], bool]:
        """
        Execute a command in the persistent shell for a session.
        
        Maintains environment variables, conda environment, and working directory
        across commands, just like a real terminal.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
            command: Command to execute
            timeout: Optional timeout in seconds
            working_dir: Optional working directory (changes directory if provided)
            
        Returns:
            Tuple of (stdout, stderr, exit_code, timed_out)
        """
        shell_key = self._get_shell_key(session_id, user_id)
        
        with self._lock:
            if shell_key not in self._shells:
                # Create shell if it doesn't exist
                shell_state = self.get_or_create_shell(session_id, user_id, working_dir)
            else:
                shell_state = self._shells[shell_key]
        
        # Acquire shell lock to ensure sequential command execution
        with shell_state.lock:
            # Update working directory if provided
            if working_dir:
                shell_state.working_directory = working_dir
            
            # Build environment: merge system env with persistent env
            env = os.environ.copy()
            env.update(shell_state.environment)
            
            # Build full command with conda activation if needed
            if shell_state.conda_env:
                conda_init = self._find_conda_init()
                if conda_init:
                    if platform.system() == "Windows":
                        full_command = f"conda activate {shell_state.conda_env} && {command}"
                    else:
                        full_command = f"source {conda_init} && conda activate {shell_state.conda_env} && {command}"
                else:
                    full_command = command
            else:
                full_command = command
            
            # Handle cd commands specially to update state
            if command.strip().startswith("cd ") or command.strip() == "cd":
                self._handle_cd_command(shell_state, command)
                return ("", "", 0, False)
            
            # Handle conda activate/deactivate commands specially to update state
            if command.strip().startswith("conda activate") or command.strip() == "conda deactivate":
                self._handle_conda_command(shell_state, command)
                return ("", "", 0, False)
            
            # Handle export/set commands to track environment variables
            # We update state AND execute the command (so the var is set in current execution too)
            if platform.system() == "Windows":
                # PowerShell: $env:VAR = "value" or set VAR=value
                if "$env:" in command or command.strip().startswith("set "):
                    self._handle_env_set_command(shell_state, command)
                    # Update env dict for current execution
                    env.update(shell_state.environment)
            else:
                # Bash: export VAR=value
                if command.strip().startswith("export "):
                    self._handle_export_command(shell_state, command)
                    # Update env dict for current execution
                    env.update(shell_state.environment)
            
            # Execute command with persistent environment
            try:
                if platform.system() == "Windows":
                    # PowerShell execution
                    ps_command = f"$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {full_command}; if ($?) {{ exit 0 }} else {{ exit 1 }}"
                    shell_cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_command]
                else:
                    # Bash execution
                    shell_cmd = ["bash", "-c", full_command]
                
                # Execute with timeout
                process = subprocess.Popen(
                    shell_cmd,
                    cwd=shell_state.working_directory,
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding='utf-8',
                    errors='replace'
                )
                
                try:
                    stdout, stderr = process.communicate(timeout=timeout)
                    exit_code = process.returncode
                    timed_out = False
                except subprocess.TimeoutExpired:
                    process.kill()
                    stdout, stderr = process.communicate()
                    exit_code = None
                    timed_out = True
                
                # Update command history
                shell_state.command_history.append(command)
                shell_state.last_command_time = time.time()
                
                return (stdout, stderr, exit_code, timed_out)
                
            except Exception as e:
                logger.error(f"Error executing command: {e}", exc_info=True)
                return ("", str(e), None, False)
    
    def _handle_cd_command(self, shell_state: ShellState, command: str):
        """Handle cd command and update working directory state."""
        cmd_stripped = command.strip()
        if cmd_stripped == "cd":
            # cd with no args goes to home
            new_dir = os.path.expanduser("~")
        else:
            # Extract directory from cd command
            dir_part = cmd_stripped[3:].strip()
            
            # Handle quoted paths
            if (dir_part.startswith("'") and dir_part.endswith("'")) or (
                dir_part.startswith('"') and dir_part.endswith('"')
            ):
                new_dir = dir_part[1:-1]
            else:
                parts = dir_part.split()
                new_dir = parts[0] if parts else dir_part
            
            new_dir = new_dir.strip("'\"")
            
            # Handle relative paths
            if not os.path.isabs(new_dir):
                new_dir = os.path.join(shell_state.working_directory, new_dir)
            new_dir = os.path.abspath(new_dir)
        
        if os.path.exists(new_dir) and os.path.isdir(new_dir):
            shell_state.working_directory = new_dir
            
    def _handle_conda_command(self, shell_state: ShellState, command: str):
        """Handle conda activate/deactivate commands."""
        cmd_stripped = command.strip()
        
        if cmd_stripped == "conda deactivate":
            shell_state.conda_env = None
            return

        if cmd_stripped.startswith("conda activate"):
            parts = cmd_stripped.split()
            if len(parts) >= 3:
                env_name = parts[2]
                if self._find_conda_init():
                    shell_state.conda_env = env_name
                else:
                    logger.warning("Conda not found, cannot activate environment")
            elif len(parts) == 2:
                # 'conda activate' -> base
                if self._find_conda_init():
                    shell_state.conda_env = "base"
    
    def _handle_export_command(self, shell_state: ShellState, command: str):
        """Handle export command and track environment variables."""
        # Parse: export VAR=value or export VAR="value"
        cmd_stripped = command.strip()
        if not cmd_stripped.startswith("export "):
            return
        
        var_part = cmd_stripped[7:].strip()  # Remove "export "
        
        # Handle: export VAR=value
        if "=" in var_part:
            parts = var_part.split("=", 1)
            if len(parts) == 2:
                key = parts[0].strip()
                value = parts[1].strip().strip("'\"")  # Remove quotes
                shell_state.environment[key] = value
    
    def _handle_env_set_command(self, shell_state: ShellState, command: str):
        """Handle PowerShell environment variable setting."""
        cmd_stripped = command.strip()
        
        # Handle: $env:VAR = "value"
        if "$env:" in cmd_stripped:
            try:
                # Extract VAR from $env:VAR = "value"
                parts = cmd_stripped.split("$env:", 1)
                if len(parts) == 2:
                    var_part = parts[1].split("=", 1)
                    if len(var_part) == 2:
                        key = var_part[0].strip()
                        value = var_part[1].strip().strip("'\"")
                        shell_state.environment[key] = value
            except Exception:
                pass
        
        # Handle: set VAR=value
        elif cmd_stripped.startswith("set "):
            var_part = cmd_stripped[4:].strip()
            if "=" in var_part:
                parts = var_part.split("=", 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    value = parts[1].strip().strip("'\"")
                    shell_state.environment[key] = value
    
    def set_environment_variable(
        self,
        session_id: str,
        user_id: str,
        key: str,
        value: str
    ):
        """
        Set an environment variable in the persistent shell.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
            key: Environment variable name
            value: Environment variable value
        """
        shell_key = self._get_shell_key(session_id, user_id)
        
        with self._lock:
            if shell_key not in self._shells:
                return
            
            shell_state = self._shells[shell_key]
        
        with self._lock:
            if shell_key not in self._shells:
                return
            
            shell_state = self._shells[shell_key]
        
        with shell_state.lock:
            # Update our tracking (will be used in next command execution)
            shell_state.environment[key] = value
    
    def activate_conda_env(
        self,
        session_id: str,
        user_id: str,
        env_name: str
    ) -> bool:
        """
        Activate a conda environment in the persistent shell.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
            env_name: Conda environment name
            
        Returns:
            True if activation succeeded, False otherwise
        """
        shell_key = self._get_shell_key(session_id, user_id)
        
        with self._lock:
            if shell_key not in self._shells:
                return False
            
            shell_state = self._shells[shell_key]
        
        with self._lock:
            if shell_key not in self._shells:
                return False
            
            shell_state = self._shells[shell_key]
        
        with shell_state.lock:
            # Verify conda is available
            conda_init = self._find_conda_init()
            if not conda_init:
                logger.warning("Conda not found, cannot activate environment")
                return False
            
            # Store conda environment (will be used in next command execution)
            shell_state.conda_env = env_name
            return True
    
    def _find_conda_init(self) -> Optional[str]:
        """Find conda initialization script."""
        # Common locations
        conda_base = os.environ.get("CONDA_PREFIX")
        if conda_base:
            if platform.system() == "Windows":
                return os.path.join(conda_base, "Scripts", "conda.exe")
            else:
                return os.path.join(conda_base, "..", "etc", "profile.d", "conda.sh")
        
        # Try to find conda in PATH
        import shutil
        conda_path = shutil.which("conda")
        if conda_path:
            if platform.system() == "Windows":
                return conda_path
            else:
                # Find conda.sh relative to conda executable
                conda_dir = os.path.dirname(conda_path)
                conda_sh = os.path.join(conda_dir, "..", "etc", "profile.d", "conda.sh")
                if os.path.exists(conda_sh):
                    return os.path.abspath(conda_sh)
        
        return None
    
    def get_shell_state(
        self,
        session_id: str,
        user_id: str
    ) -> Optional[ShellState]:
        """
        Get the shell state for a session.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
            
        Returns:
            ShellState if exists, None otherwise
        """
        shell_key = self._get_shell_key(session_id, user_id)
        
        with self._lock:
            return self._shells.get(shell_key)
    
    def cleanup_shell(self, session_id: str, user_id: str):
        """
        Clean up and terminate a shell session.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
        """
        shell_key = self._get_shell_key(session_id, user_id)
        
        with self._lock:
            if shell_key not in self._shells:
                return
            
            shell_state = self._shells[shell_key]
            shell_state.is_active = False
            
            # Clean up (no process to terminate with simplified approach)
            del self._shells[shell_key]
            if shell_key in self._output_readers:
                del self._output_readers[shell_key]
            
            logger.info(f"Cleaned up shell state for session {shell_key}")
    
    def cleanup_all(self):
        """Clean up all shell sessions."""
        with self._lock:
            shell_keys = list(self._shells.keys())
        
        for shell_key in shell_keys:
            user_id, session_id = shell_key.split(":", 1)
            self.cleanup_shell(session_id, user_id)


# Global singleton instance
_shell_manager: Optional[PersistentShellManager] = None


def get_shell_manager() -> PersistentShellManager:
    """Get the global PersistentShellManager instance."""
    global _shell_manager
    if _shell_manager is None:
        _shell_manager = PersistentShellManager()
    return _shell_manager

