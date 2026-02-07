"""
System prompts and prompt templates for the Desktop Assistant.

Uses a singleton PromptManager that loads prompts at startup (not at import time)
to prevent import-time crashes and ensure fail-fast behavior.
"""

import platform
import threading
from pathlib import Path
from typing import Optional


class PromptManager:
    """
    Singleton that loads prompts at startup and fails fast if missing.
    
    Prevents import-time crashes by deferring initialization until explicitly called.
    
    THREAD-SAFETY: Uses a lock to prevent race conditions during initialization
    in multi-threaded contexts (e.g., concurrent request handling).
    """
    
    _instance: Optional['PromptManager'] = None
    _system_prompt: Optional[str] = None
    _lock = threading.Lock()  # Protects initialization
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                # Double-check pattern to prevent race condition
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def initialize(self, prompt_file_path: Optional[Path] = None) -> None:
        """
        Load system prompt at startup. Raises exception if file is missing.
        Should be called during application initialization.
        
        THREAD-SAFETY: Uses lock to prevent concurrent initialization race conditions.
        
        Args:
            prompt_file_path: Optional path to prompt file. Defaults to system_prompt.txt
                            in the same directory as this module.
        
        Raises:
            RuntimeError: If the prompt file cannot be loaded (missing, permission error, etc.)
        """
        if prompt_file_path is None:
            # Default to file in the same directory
            prompt_file_path = Path(__file__).parent / "system_prompt.txt"

        # Hold lock during entire initialization to avoid duplicate file reads
        # during concurrent startup paths.
        with self._lock:
            if self._system_prompt is not None:
                return
            self._system_prompt = self._load_and_format_prompt(prompt_file_path)

    def _load_and_format_prompt(self, prompt_file_path: Path) -> str:
        """Load prompt template from disk and replace runtime placeholders."""
        try:
            template = prompt_file_path.read_text(encoding="utf-8")
            
            # Validate file is not empty
            if not template or not template.strip():
                raise RuntimeError(
                    f"CRITICAL: System prompt file is empty: {prompt_file_path}. "
                    "Application cannot start without a valid system prompt."
                )
            
            # Replace placeholders
            current_os = platform.system()
            return template.replace("{os}", current_os)
        except FileNotFoundError:
            raise RuntimeError(
                f"CRITICAL: System prompt file not found: {prompt_file_path}. "
                "Application cannot start without system prompt."
            )
        except PermissionError as e:
            raise RuntimeError(
                f"CRITICAL: Cannot read system prompt file: {prompt_file_path}. "
                f"Permission denied: {e}"
            )
        except UnicodeDecodeError as e:
            raise RuntimeError(
                f"CRITICAL: System prompt file is not valid UTF-8: {prompt_file_path}. "
                f"Error: {e}"
            )
    
    @property
    def system_prompt(self) -> str:
        """
        Get system prompt. Raises if not initialized.
        
        Returns:
            The system prompt string
        
        Raises:
            RuntimeError: If PromptManager has not been initialized
        """
        if self._system_prompt is None:
            raise RuntimeError(
                "PromptManager not initialized. Call initialize() at app startup."
            )
        return self._system_prompt


# Global accessor function (for backward compatibility)
def get_system_prompt() -> str:
    """
    Get system prompt. Assumes PromptManager was initialized at startup.
    
    Returns:
        The system prompt string
    
    Raises:
        RuntimeError: If PromptManager has not been initialized
    """
    return PromptManager().system_prompt


# NOTE: Do NOT create a module-level SYSTEM_PROMPT constant.
# This would cause import-time crashes if PromptManager is not initialized.
# Consumers must call get_system_prompt() at runtime.
