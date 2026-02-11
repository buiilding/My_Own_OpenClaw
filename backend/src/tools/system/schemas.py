"""
Pydantic schemas for system tools.
"""
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

# --- Shell Tool Schemas ---

class RunShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    command: str = Field(..., description="Exact command to execute")
    directory: Optional[str] = Field(None, description="(OPTIONAL) The absolute path of the directory to run the command in. If not provided, defaults to the OS user home directory. Must be an absolute path and must already exist.")
    run_in_background: bool = Field(
        ...,
        description="If True, run the command in the background without waiting for output. Returns immediately with execution confirmation. If False, wait for command completion and return output."
    )
    terminate_after_seconds: Optional[float] = Field(
        120.0,
        description="(OPTIONAL, only used when run_in_background=False) Maximum time in seconds to wait before terminating the command and returning current output. Default is 120 seconds (2 minutes). Set to None for no timeout limit."
    )
    yield_after_seconds: Optional[float] = Field(
        None,
        description="(OPTIONAL) Return early if the command runs longer than this. The command continues in the background.",
    )
    env: Optional[dict[str, str]] = Field(
        None,
        description="(OPTIONAL) Environment variable overrides for the command.",
    )
    pty: Optional[bool] = Field(
        None,
        description="(OPTIONAL) Request a pseudo-terminal (best-effort).",
    )
    explanation: str = Field(
        ...,
        description="One sentence explanation as to why this tool is being used, and how it contributes to the goal."
    )
    wait: Optional[float] = Field(
        None,
        description="(OPTIONAL) Delay in seconds before taking a screenshot after tool execution. If provided, the tool will wait and capture a screenshot like computer-use tools."
    )


class ProcessShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: str = Field(
        ...,
        description="Action to perform: list, poll, log, write, send-keys, submit, paste, kill, clear, remove.",
    )
    session_id: Optional[str] = Field(None, description="Session id for actions other than list/clear")
    data: Optional[str] = Field(None, description="Data to write for write action")
    keys: Optional[list[str]] = Field(None, description="Key tokens for send-keys action")
    hex: Optional[list[str]] = Field(None, description="Hex bytes for send-keys action")
    literal: Optional[str] = Field(None, description="Literal text for send-keys action")
    text: Optional[str] = Field(None, description="Text for paste action")
    bracketed: Optional[bool] = Field(None, description="Wrap paste in bracketed mode")
    eof: Optional[bool] = Field(None, description="Close stdin after write action")
    offset: Optional[int] = Field(None, description="Log line offset")
    limit: Optional[int] = Field(None, description="Log line limit")


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
