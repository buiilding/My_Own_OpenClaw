"""
Shell Manager for managing persistent shell sessions.

Provides a factory for creating platform-appropriate shell sessions.
"""
import logging
import platform
from typing import Dict, Optional

from backend.src.services.shell.interface import ShellSession
from backend.src.services.shell.unix_session import UnixShellSession
from backend.src.services.shell.windows_session import WindowsShellSession

logger = logging.getLogger(__name__)


class ShellManager:
    """
    Manages shell sessions across the application.
    
    Provides a clean interface for creating and managing shell sessions
    without exposing platform-specific details.
    """
    
    def __init__(self):
        """Initialize shell manager."""
        self._sessions: Dict[str, ShellSession] = {}
        self._platform = platform.system()
    
    def create_session(
        self, 
        session_id: str, 
        user_id: str, 
        working_dir: Optional[str] = None
    ) -> ShellSession:
        """
        Create a new shell session.
        
        Args:
            session_id: Unique session identifier
            user_id: User identifier
            working_dir: Initial working directory (optional)
            
        Returns:
            ShellSession instance appropriate for the platform
        """
        key = self._get_session_key(session_id, user_id)
        
        # Close existing session if present
        if key in self._sessions:
            self._sessions[key].close()
        
        # Create platform-appropriate session
        if self._platform == "Windows":
            session = WindowsShellSession(session_id, user_id, working_dir)
        else:
            session = UnixShellSession(session_id, user_id, working_dir)
        
        self._sessions[key] = session
        logger.debug(f"Created shell session: {key}")
        
        return session
    
    def get_session(self, session_id: str, user_id: str) -> Optional[ShellSession]:
        """
        Get an existing shell session.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
            
        Returns:
            ShellSession if found, None otherwise
        """
        key = self._get_session_key(session_id, user_id)
        return self._sessions.get(key)
    
    def cleanup_session(self, session_id: str, user_id: str) -> None:
        """
        Clean up and remove a shell session.
        
        Args:
            session_id: Session identifier
            user_id: User identifier
        """
        key = self._get_session_key(session_id, user_id)
        session = self._sessions.get(key)
        if session:
            session.close()
            del self._sessions[key]
            logger.debug(f"Cleaned up shell session: {key}")
    
    def _get_session_key(self, session_id: str, user_id: str) -> str:
        """Generate session key."""
        return f"{user_id}:{session_id}"


# Global singleton instance
_shell_manager: Optional[ShellManager] = None


def get_shell_manager() -> ShellManager:
    """
    Get the global shell manager instance.
    
    Returns:
        ShellManager singleton
    """
    global _shell_manager
    if _shell_manager is None:
        _shell_manager = ShellManager()
    return _shell_manager

