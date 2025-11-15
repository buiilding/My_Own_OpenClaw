"""
System prompts and prompt templates for the Desktop Assistant.
"""

import platform
from pathlib import Path

# Screenshot marker format constants for embedding screenshots in conversation history
SCREENSHOT_MARKER_PREFIX = "📸 State of the screen after"
SCREENSHOT_MARKER_SUFFIX = "was executed:"


def format_screenshot_message(tool_name: str, screenshot_data: str) -> str:
    """
    Format a message with embedded screenshot data.

    Args:
        tool_name: Name of the tool that was executed
        screenshot_data: Base64-encoded screenshot data

    Returns:
        Formatted message string with screenshot marker
    """
    return f"\n\n{SCREENSHOT_MARKER_PREFIX} {tool_name} {SCREENSHOT_MARKER_SUFFIX}{screenshot_data}"


def load_system_prompt() -> str:
    """
    Load the system prompt from the text file and format it with current context.

    Returns:
        Formatted system prompt string
    """
    # Get the path to the system prompt file
    current_dir = Path(__file__).parent
    prompt_file = current_dir / "system_prompt.txt"

    try:
        with open(prompt_file, "r", encoding="utf-8") as f:
            prompt_template = f.read()

        # Replace placeholders with current context
        current_os = platform.system()

        prompt = prompt_template.replace("{os}", current_os)

        return prompt

    except FileNotFoundError:
        # Fallback if file doesn't exist
        return "You are a helpful desktop assistant. Available tools are listed below."


# System prompt loaded from file
SYSTEM_PROMPT = load_system_prompt()
