"""
Core tool definitions.

This module explicitly lists all core tools to be registered by the ToolRegistry.
This avoids dynamic scanning (magic) and allows for better static analysis and performance.
"""

from backend.src.tools.computer.keyboard_tool import KeyboardTool
from backend.src.tools.computer.mouse_tool import MouseTool
from backend.src.tools.computer.predict_click_tool import PredictClickTool
from backend.src.tools.computer.click_ocr_tool import ClickOCRTool
from backend.src.tools.computer.scroll_tool import ScrollTool
from backend.src.tools.computer.screenshot_tool import ScreenshotTool
from backend.src.tools.filesystem.write_file_tool import WriteFileTool
from backend.src.tools.filesystem.replace_tool import ReplaceTool
from backend.src.tools.filesystem.search_file_content_tool import SearchFileContentTool
from backend.src.tools.filesystem.read_many_files_tool import ReadManyFilesTool
from backend.src.tools.filesystem.list_directory_tool import ListDirectoryTool
from backend.src.tools.filesystem.glob_tool import GlobTool
from backend.src.tools.filesystem.read_file_tool_sdk import ReadFileToolSDK
from backend.src.tools.system.shell_tool import ShellTool
from backend.src.tools.marketplace.search_marketplace_tool import SearchMarketplaceTool

# List of tool classes to register
CORE_TOOLS = [
    KeyboardTool,
    MouseTool,
    PredictClickTool,
    ClickOCRTool,
    ScrollTool,
    ScreenshotTool,
    WriteFileTool,
    ReplaceTool,
    SearchFileContentTool,
    ReadManyFilesTool,
    ListDirectoryTool,
    GlobTool,
    ReadFileToolSDK,
    ShellTool,
    SearchMarketplaceTool,
]

