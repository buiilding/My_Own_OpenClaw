import json
from typing import List, Type, Any
from pydantic import BaseModel, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.services.system_monitor import system_monitor

class GetOpenWindowsArgs(BaseModel):
    """Arguments for listing open windows."""
    filter_text: str = Field(
        default="",
        description="Optional text to filter window titles by (case-insensitive)."
    )
    explanation: str = Field(
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )

class GetOpenWindowsTool(Tool[GetOpenWindowsArgs]):
    """
    Tool to list all currently open windows.
    Useful for finding if an application is already running before launching a new instance.
    """
    name = "get_open_windows"
    description = "Lists all currently open window titles. Use this to check if an app is already open before launching a new instance."
    args_model = GetOpenWindowsArgs

    async def run(self, args: GetOpenWindowsArgs, ctx: ToolContext) -> dict:
        windows = system_monitor.get_open_windows()
        
        if args.filter_text:
            query = args.filter_text.lower()
            windows = [w for w in windows if query in w.lower()]
        
        if not windows:
            content = "No open windows found."
        else:
            content = "\\n".join(f"- {w}" for w in windows)
            
        return {
            "llm_content": content,
            "data": windows
        }

class GetSystemStatsArgs(BaseModel):
    """Arguments for checking system stats."""
    explanation: str = Field(
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )

class GetSystemStatsTool(Tool[GetSystemStatsArgs]):
    """
    Tool to get current system resource usage (CPU, RAM, Battery).
    """
    name = "get_system_stats"
    description = "Returns current system resource usage (CPU %, Memory %, Battery). Use this to check system performance before running resource-intensive operations."
    args_model = GetSystemStatsArgs

    async def run(self, args: GetSystemStatsArgs, ctx: ToolContext) -> dict:
        stats = system_monitor.get_system_stats()
        content = json.dumps(stats, indent=2)
        return {
            "llm_content": content,
            "data": stats
        }

