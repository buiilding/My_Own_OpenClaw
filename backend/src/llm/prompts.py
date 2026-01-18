"""
System prompts and prompt templates for the Desktop Assistant.

Uses a singleton PromptManager that loads prompts at startup (not at import time)
to prevent import-time crashes and ensure fail-fast behavior.
"""

import platform
from pathlib import Path
from typing import Optional


class PromptManager:
    """
    Singleton that loads prompts at startup and fails fast if missing.
    
    Prevents import-time crashes by deferring initialization until explicitly called.
    """
    
    _instance: Optional['PromptManager'] = None
    _system_prompt: Optional[str] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def initialize(self, prompt_file_path: Optional[Path] = None) -> None:
        """
        Load system prompt at startup. Raises exception if file is missing.
        Should be called during application initialization.
        
        Args:
            prompt_file_path: Optional path to prompt file. Defaults to system_prompt.txt
                            in the same directory as this module.
        
        Raises:
            RuntimeError: If the prompt file cannot be loaded (missing, permission error, etc.)
        """
        if self._system_prompt is not None:
            return  # Already initialized
        
        if prompt_file_path is None:
            # Default to file in the same directory
            prompt_file_path = Path(__file__).parent / "system_prompt.txt"
        
        try:
            with open(prompt_file_path, "r", encoding="utf-8") as f:
                template = f.read()
            
            # Validate file is not empty
            if not template or not template.strip():
                raise RuntimeError(
                    f"CRITICAL: System prompt file is empty: {prompt_file_path}. "
                    "Application cannot start without a valid system prompt."
                )
            
            # Replace placeholders
            current_os = platform.system()
            self._system_prompt = template.replace("{os}", current_os)
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

