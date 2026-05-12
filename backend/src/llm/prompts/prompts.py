"""
System prompts and prompt templates for the Desktop Assistant.

Uses a singleton PromptManager that loads prompts at startup (not at import time)
to prevent import-time crashes and ensure fail-fast behavior.
"""

import platform
import re
import threading
from pathlib import Path
from typing import Iterable, Optional

from backend.src.tools.tool_selection import load_tool_selection

_METHOD_SECTION_TAGS: tuple[str, ...] = ("ocr", "prediction")


def _filter_prompt_method_sections(
    prompt_text: str,
    allowed_coordinate_methods: Optional[Iterable[str]] = None,
) -> str:
    """Strip prompt sections gated by the effective coordinate-method policy."""
    if allowed_coordinate_methods is None:
        selection = load_tool_selection()
        if selection is None:
            allowed_methods = set(_METHOD_SECTION_TAGS)
        else:
            allowed_methods = set(selection.get_allowed_mouse_coordinate_methods())
    else:
        allowed_methods = {
            method for method in allowed_coordinate_methods if isinstance(method, str)
        }

    filtered = prompt_text
    for method_name in _METHOD_SECTION_TAGS:
        pattern = re.compile(
            rf"\n?<!-- tool_selection:{method_name}:start -->\n?(.*?)\n?<!-- tool_selection:{method_name}:end -->",
            re.DOTALL,
        )
        replacement = r"\1" if method_name in allowed_methods else ""
        filtered = pattern.sub(replacement, filtered)
    return filtered


class PromptManager:
    """
    Singleton that loads prompts at startup and fails fast if missing.

    Prevents import-time crashes by deferring initialization until explicitly called.

    THREAD-SAFETY: Uses a lock to prevent race conditions during initialization
    in multi-threaded contexts (e.g., concurrent request handling).
    """

    _instance: Optional["PromptManager"] = None
    _system_prompt_template: Optional[str] = None
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
        else:
            prompt_file_path = Path(prompt_file_path)

        # Hold lock during entire initialization to avoid duplicate file reads
        # during concurrent startup paths.
        with self._lock:
            if self._system_prompt_template is not None:
                return
            self._system_prompt_template = self._load_prompt_template(prompt_file_path)

    def _load_prompt_template(self, prompt_file_path: Path) -> str:
        """Load the raw prompt template from disk."""
        try:
            template = prompt_file_path.read_text(encoding="utf-8")

            # Validate file is not empty
            if not template or not template.strip():
                raise RuntimeError(
                    f"CRITICAL: System prompt file is empty: {prompt_file_path}. "
                    "Application cannot start without a valid system prompt."
                )

            return template
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
        except OSError as e:
            raise RuntimeError(
                f"CRITICAL: Cannot read system prompt file: {prompt_file_path}. "
                f"OS error: {e}"
            )
        except UnicodeDecodeError as e:
            raise RuntimeError(
                f"CRITICAL: System prompt file is not valid UTF-8: {prompt_file_path}. "
                f"Error: {e}"
            )

    @property
    def system_prompt(self) -> str:
        """
        Get the backend-default rendered system prompt. Raises if not initialized.

        Returns:
            The system prompt string

        Raises:
            RuntimeError: If PromptManager has not been initialized
        """
        return self.render_system_prompt()

    def render_system_prompt(
        self,
        operating_system: Optional[str] = None,
        workspace_path: Optional[str] = None,
        allowed_coordinate_methods: Optional[Iterable[str]] = None,
    ) -> str:
        """Render the loaded prompt template for a specific operating system."""
        if self._system_prompt_template is None:
            raise RuntimeError(
                "PromptManager not initialized. Call initialize() at app startup."
            )
        resolved_operating_system = platform.system()
        if isinstance(operating_system, str):
            normalized = operating_system.strip()
            if normalized:
                resolved_operating_system = normalized
        resolved_workspace_path = "None"
        if isinstance(workspace_path, str):
            normalized_workspace_path = workspace_path.strip()
            if normalized_workspace_path:
                resolved_workspace_path = normalized_workspace_path
        rendered_prompt = self._system_prompt_template.replace(
            "{os}", resolved_operating_system
        ).replace("{workspace_path}", resolved_workspace_path)
        return _filter_prompt_method_sections(
            rendered_prompt,
            allowed_coordinate_methods=allowed_coordinate_methods,
        )


# Global accessor function (for backward compatibility)
def get_system_prompt(
    operating_system: Optional[str] = None,
    workspace_path: Optional[str] = None,
    allowed_coordinate_methods: Optional[Iterable[str]] = None,
) -> str:
    """
    Get system prompt. Assumes PromptManager was initialized at startup.

    Returns:
        The system prompt string

    Raises:
        RuntimeError: If PromptManager has not been initialized
    """
    return PromptManager().render_system_prompt(
        operating_system,
        workspace_path,
        allowed_coordinate_methods=allowed_coordinate_methods,
    )


# NOTE: Do NOT create a module-level SYSTEM_PROMPT constant.
# This would cause import-time crashes if PromptManager is not initialized.
# Consumers must call get_system_prompt() at runtime.
