"""
Pydantic schemas for system tools.
"""
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from backend.src.tools.schema_fields import explanation_field


def _optional_process_field(description: str):
    return Field(None, description=description)


# --- Shell Tool Schemas ---

class RunShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    command: str = Field(..., description="Exact command to execute")
    directory: Optional[str] = Field(None, description="(OPTIONAL) The absolute path of the directory to run the command in. If not provided, defaults to the OS user home directory. Must be an absolute path and must already exist.")
    run_in_background: bool = Field(
        ...,
        description=(
            "If True, start command asynchronously and return immediately with a session id. "
            "Use this for GUI app launches and long-running commands so the agent does not block. "
            "Then use the process tool to poll logs, write input, or terminate the session. "
            "If False, wait for command completion and return output."
        ),
    )
    terminate_after_seconds: Optional[float] = Field(
        120.0,
        description="(OPTIONAL, only used when run_in_background=False) Maximum time in seconds to wait before terminating the command and returning current output. Default is 120 seconds (2 minutes). Set to None for no timeout limit."
    )
    yield_after_seconds: Optional[float] = Field(
        None,
        description=(
            "(OPTIONAL) Return early if the command runs longer than this duration. "
            "The process keeps running in the background and can be managed with the process tool."
        ),
    )
    max_output_tokens: Optional[int] = Field(
        None,
        gt=0,
        description=(
            "(OPTIONAL) Maximum number of output tokens to include in llm_content for foreground responses. "
            "Defaults to 10000 when omitted. Excess output is truncated with a marker."
        ),
    )
    env: Optional[dict[str, str]] = Field(
        None,
        description="(OPTIONAL) Environment variable overrides for the command.",
    )
    pty: Optional[bool] = Field(
        None,
        description="(OPTIONAL) Request a pseudo-terminal (best-effort).",
    )
    explanation: str = explanation_field()
    wait: Optional[float] = Field(
        None,
        description=(
            "(OPTIONAL) Delay in seconds before taking a screenshot after execution. "
            "Use this when command effects are visual (for example, launching a GUI app) "
            "to verify the UI state after launch."
        ),
    )


class ProcessShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra='forbid')

    action: str = Field(
        ...,
        description=(
            "Action to perform on background shell sessions from run_shell_command: "
            "list, poll, log, write, send-keys, submit, paste, kill, clear, remove."
        ),
    )
    session_id: Optional[str] = Field(
        None,
        description=(
            "Session id returned by run_shell_command (required for actions other than list/clear)."
        ),
    )
    data: Optional[str] = _optional_process_field("Data to write for write action")
    keys: Optional[list[str]] = _optional_process_field("Key tokens for send-keys action")
    hex: Optional[list[str]] = _optional_process_field("Hex bytes for send-keys action")
    literal: Optional[str] = _optional_process_field("Literal text for send-keys action")
    text: Optional[str] = _optional_process_field("Text for paste action")
    bracketed: Optional[bool] = _optional_process_field("Wrap paste in bracketed mode")
    eof: Optional[bool] = _optional_process_field("Close stdin after write action")
    offset: Optional[int] = _optional_process_field("Log line offset")
    limit: Optional[int] = _optional_process_field("Log line limit")


# --- System Info Schemas ---

class GetOpenWindowsArgs(BaseModel):
    """Arguments for listing open windows."""
    model_config = ConfigDict(extra='forbid')
    
    filter_text: str = Field(
        default="",
        description="Optional text to filter window titles by (case-insensitive)."
    )
    explanation: str = explanation_field()

class GetSystemStatsArgs(BaseModel):
    """Arguments for checking system stats."""
    model_config = ConfigDict(extra='forbid')
    
    explanation: str = explanation_field()
