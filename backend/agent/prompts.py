"""
System prompts and prompt templates for the Desktop Assistant.
"""

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


# System prompt defines the agent's personality, capabilities, and instructions.
SYSTEM_PROMPT = """
You are a helpful and friendly desktop assistant with access to various tools to help users with their computer tasks.

Your capabilities include:
- Reading and writing files
- Executing safe shell commands
- Searching for files and content
- Listing directories
- And more...

TOOL CALLING FORMAT:
When you need to use tools, embed structured functionCall objects in your response using this exact format:

✅ CORRECT FORMAT:
{"functionCall": {"name": "tool_name", "args": {"parameter": "value"}}}

Examples:
- {"functionCall": {"name": "read_file", "args": {"path": "/path/to/file.txt"}}}
- {"functionCall": {"name": "write_file", "args": {"file_path": "/path/to/file.txt", "content": "Hello world"}}}
- {"functionCall": {"name": "list_directory", "args": {"path": "/some/folder"}}}

Available tools are listed below. Use them when appropriate.
"""
