"""
Shell Session Interface.

Abstract base classes for shell session management.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class ShellResult:
    """Result of a shell command execution."""
    output: str
    error: Optional[str]
    exit_code: int
    timed_out: bool


class ShellSession(ABC):
    """
    Abstract base class for shell sessions.
    
    Provides a clean interface for executing commands in persistent shell sessions
    without delimiter hacks or platform-specific details leaking through.
    """
    
    def __init__(self, session_id: str, user_id: str, working_dir: Optional[str] = None):
        """
        Initialize shell session.
        
        Args:
            session_id: Unique session identifier
            user_id: User identifier
            working_dir: Initial working directory (optional)
        """
        self.session_id = session_id
        self.user_id = user_id
        self.working_dir = working_dir
    
    @abstractmethod
    async def execute(self, command: str, timeout: float) -> ShellResult:
        """
        Execute a command in the shell session.
        
        Args:
            command: Command to execute
            timeout: Maximum execution time in seconds
            
        Returns:
            ShellResult with output, error, exit code, and timeout status
        """
        pass
    
    @abstractmethod
    async def get_exit_code(self) -> int:
        """
        Get the exit code of the last executed command.
        
        Returns:
            Exit code (0 for success, non-zero for failure, -1 if unable to determine)
        """
        pass
    
    @abstractmethod
    async def get_working_directory(self) -> str:
        """
        Get the current working directory.
        
        Returns:
            Current working directory path
        """
        pass
    
    @abstractmethod
    async def change_directory(self, directory: str) -> bool:
        """
        Change the working directory.
        
        Args:
            directory: Target directory path
            
        Returns:
            True if successful, False otherwise
        """
        pass
    
    @abstractmethod
    async def close(self) -> None:
        """Close the shell session and clean up resources."""
        pass

