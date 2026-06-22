"""
Pydantic schemas for system tools.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.src.tools.schema_fields import explanation_field


def _optional_process_field(description: str):
    return Field(None, description=description)


# --- Shell Tool Schemas ---


class RunShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    command: str = Field(
        ...,
        description=(
            "Exact command to execute. For repository or log search, prefer fast targeted "
            "commands such as rg instead of broad recursive grep, and exclude generated "
            "dependency, build-artifact, packaged-runtime, and VCS directories unless the "
            "user explicitly needs them."
        ),
    )
    directory: Optional[str] = Field(
        None,
        description=(
            "(OPTIONAL) Working directory. Absolute paths are allowed, and relative paths "
            "resolve from the user-selected workspace folder when configured, "
            "otherwise from the OS user home directory. If omitted, the runtime uses that "
            "default base directory directly."
        ),
    )
    run_in_background: bool = Field(
        ...,
        description=(
            "If True, start command asynchronously and return immediately with a session id. "
            "Use this for GUI app launches and long-running commands so the agent does not block. "
            "Then use the returned session id to poll logs, write input, or terminate the session. "
            "If False, block until command completion and return output."
        ),
    )
    terminate_after_seconds: Optional[float] = Field(
        120.0,
        description="(OPTIONAL, only used when run_in_background=False) Maximum time in seconds to allow before terminating the command and returning current output. Default is 120 seconds (2 minutes). Set to None for no timeout limit.",
    )
    yield_after_seconds: Optional[float] = Field(
        None,
        description=(
            "(OPTIONAL) Return early if the command runs longer than this duration. "
            "The command keeps running in the background and can be managed with the returned session id."
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
            "(OPTIONAL) Delay in seconds before capturing a screen image after execution. "
            "Use this when command effects are visual (for example, launching a GUI app) "
            "to verify the UI state after launch."
        ),
    )


class OpenAppArgs(BaseModel):
    """Arguments for detached GUI app launch."""

    model_config = ConfigDict(extra="forbid")

    command: str = Field(
        ...,
        description=(
            "Executable or app command to launch as a detached desktop process. "
            "Use this for opening GUI apps that should remain running after the current agent turn ends."
        ),
    )
    args: Optional[list[str]] = Field(
        None,
        description="(OPTIONAL) Positional arguments for command launch.",
    )
    directory: Optional[str] = Field(
        None,
        description="(OPTIONAL) Absolute working directory for launch.",
    )
    verify: Literal["none", "window", "screenshot"] = Field(
        "window",
        description=(
            "(OPTIONAL) Post-launch verification mode: "
            "`none` for fast ack, `window` to poll open windows, `screenshot` to capture visual proof."
        ),
    )
    verify_window_title: Optional[str] = Field(
        None,
        description="(OPTIONAL) Window title substring expected after launch; improves window verification precision.",
    )
    verify_timeout_seconds: Optional[float] = Field(
        6.0,
        ge=0.0,
        description="(OPTIONAL) Max seconds for post-launch verification polling/capture.",
    )
    explanation: str = explanation_field()


ProcessShellAction = Literal[
    "list",
    "poll",
    "log",
    "write",
    "send-keys",
    "submit",
    "paste",
    "kill",
    "clear",
    "remove",
]


class ProcessShellCommandArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: ProcessShellAction = Field(
        ...,
        description=(
            "Action to perform on background shell sessions: "
            "list, poll, log, write, send-keys, submit, paste, kill, clear, remove."
        ),
    )
    session_id: Optional[str] = Field(
        None,
        description=(
            "Session id returned by a previous background shell command invocation (required for actions other than list/clear)."
        ),
    )
    data: Optional[str] = _optional_process_field("Data to write for write action")
    keys: Optional[list[str]] = _optional_process_field(
        "Key tokens for send-keys action"
    )
    hex: Optional[list[str]] = _optional_process_field("Hex bytes for send-keys action")
    literal: Optional[str] = _optional_process_field(
        "Literal text for send-keys action"
    )
    text: Optional[str] = _optional_process_field("Text for paste action")
    bracketed: Optional[bool] = _optional_process_field("Wrap paste in bracketed mode")
    eof: Optional[bool] = _optional_process_field("Close stdin after write action")
    offset: Optional[int] = _optional_process_field("Log line offset")
    limit: Optional[int] = _optional_process_field("Log line limit")


# --- System Info Schemas ---


class GetOpenWindowsArgs(BaseModel):
    """Arguments for listing open windows."""

    model_config = ConfigDict(extra="forbid")

    filter_text: str = Field(
        default="",
        description="Optional text to filter window titles by (case-insensitive).",
    )
    explanation: str = explanation_field()


class GetSystemStatsArgs(BaseModel):
    """Arguments for checking system stats."""

    model_config = ConfigDict(extra="forbid")

    explanation: str = explanation_field()
