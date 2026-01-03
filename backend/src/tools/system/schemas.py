"""
Pydantic schemas for system tools.
"""
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

# --- Shell Tool Schemas ---

class RunShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    command: str = Field(..., description="Exact command to execute")
    directory: Optional[str] = Field(None, description="(OPTIONAL) The absolute path of the directory to run the command in. If not provided, uses the current persistent working directory from conversation context. Must be an absolute path and must already exist.")
    run_in_background: bool = Field(
        ...,
        description="If True, run the command in the background without waiting for output. Returns immediately with execution confirmation. If False, wait for command completion and return output."
    )
    terminate_after_seconds: Optional[float] = Field(
        120.0,
        description="(OPTIONAL, only used when run_in_background=False) Maximum time in seconds to wait before terminating the command and returning current output. Default is 120 seconds (2 minutes). Set to None for no timeout limit."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )


# --- System Info Schemas ---

class GetOpenWindowsArgs(BaseModel):
    """Arguments for listing open windows."""
    model_config = ConfigDict(extra='forbid')
    
    filter_text: str = Field(
        default="",
        description="Optional text to filter window titles by (case-insensitive)."
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )

class GetSystemStatsArgs(BaseModel):
    """Arguments for checking system stats."""
    model_config = ConfigDict(extra='forbid')
    
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
