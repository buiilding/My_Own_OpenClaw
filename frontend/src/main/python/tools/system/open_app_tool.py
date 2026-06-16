"""Detached app launch tool with optional post-launch verification."""

import asyncio
import logging
import platform
import shlex
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, Optional

from tools.computer.screenshot_tool import capture_screenshot
from tools.system.window_tool import get_open_windows

logger = logging.getLogger(__name__)

IS_WINDOWS = platform.system() == "Windows"
_ALLOWED_VERIFY_MODES = {"none", "window", "screenshot"}
_DEFAULT_VERIFY_MODE = "window"
_DEFAULT_VERIFY_TIMEOUT_SECONDS = 6.0
_MAX_VERIFY_TIMEOUT_SECONDS = 30.0
_WINDOW_VERIFY_POLL_SECONDS = 0.25
_SCREENSHOT_VERIFY_DELAY_SECONDS = 0.75


async def open_app(args: Dict[str, Any]) -> Dict[str, Any]:
    """Launch an app detached from sidecar lifecycle with optional verification."""
    command = args.get("command")
    if not isinstance(command, str) or not command.strip():
        return {"success": False, "error": "command is required"}
    command = command.strip()

    command_args, command_args_error = _coerce_command_args(args.get("args"))
    if command_args_error:
        return {"success": False, "error": command_args_error}

    working_directory, directory_error = _resolve_working_directory(args.get("directory"))
    if directory_error:
        return {"success": False, "error": directory_error}

    verify_mode, verify_mode_error = _resolve_verify_mode(args.get("verify"))
    if verify_mode_error:
        return {"success": False, "error": verify_mode_error}

    verify_timeout_seconds, timeout_error = _resolve_verify_timeout_seconds(
        args.get("verify_timeout_seconds")
    )
    if timeout_error:
        return {"success": False, "error": timeout_error}

    requested_window_title, window_title_error = _resolve_window_title(args.get("verify_window_title"))
    if window_title_error:
        return {"success": False, "error": window_title_error}

    inferred_window_title = _infer_window_title(command, command_args)
    verify_window_title = requested_window_title or inferred_window_title

    try:
        launch_result = await asyncio.to_thread(
            _launch_detached_process,
            command,
            command_args,
            working_directory,
        )
    except RuntimeError as error:
        return {"success": False, "error": str(error)}

    elapsed_ms = max(int((time.time() - launch_result["started_at"]) * 1000), 0)

    response_data: Dict[str, Any] = {
        "command": command,
        "args": command_args,
        "working_directory": working_directory,
        "detached": True,
        "pid": launch_result.get("pid"),
        "verify_mode": verify_mode,
        "verify_window_title": verify_window_title,
        "launch_elapsed_ms": elapsed_ms,
    }

    if verify_mode == "none":
        response_data.update(
            {
                "verify_status": "skipped",
                "verified": False,
                "matched_window_title": None,
            }
        )
    else:
        response_data.update(
            await _verify_window_open(
                verify_window_title,
                timeout_seconds=verify_timeout_seconds,
            )
        )

    if verify_mode == "screenshot":
        response_data.update(await _capture_verification_screenshot(verify_timeout_seconds))
        if response_data.get("verify_status") != "verified":
            if "screenshot_path" in response_data:
                response_data["verify_status"] = "screenshot_captured"
            else:
                response_data["verify_status"] = "screenshot_failed"

    output = _build_output(response_data)
    response_data["output"] = output

    return {
        "success": True,
        "data": response_data,
    }


def _coerce_command_args(raw_args: object) -> tuple[list[str], Optional[str]]:
    if raw_args is None:
        return [], None
    if not isinstance(raw_args, list):
        return [], "args must be an array of strings"

    normalized: list[str] = []
    for index, value in enumerate(raw_args):
        if not isinstance(value, str):
            return [], f"args[{index}] must be a string"
        normalized.append(value)
    return normalized, None


def _resolve_working_directory(raw_directory: object) -> tuple[Optional[str], Optional[str]]:
    if raw_directory is None:
        return None, None
    if not isinstance(raw_directory, str):
        return None, "directory must be a string"

    normalized = raw_directory.strip()
    if not normalized:
        return None, None

    working_path = Path(normalized)
    if not working_path.is_absolute():
        return None, "directory must be an absolute path"
    if not working_path.exists() or not working_path.is_dir():
        return None, f"Directory does not exist or is not a directory: {normalized}"
    return str(working_path), None


def _resolve_verify_mode(raw_mode: object) -> tuple[str, Optional[str]]:
    if raw_mode is None:
        return _DEFAULT_VERIFY_MODE, None
    if not isinstance(raw_mode, str):
        return "", "verify must be one of: none, window, screenshot"

    normalized = raw_mode.strip().lower()
    if normalized not in _ALLOWED_VERIFY_MODES:
        return "", "verify must be one of: none, window, screenshot"
    return normalized, None


def _resolve_verify_timeout_seconds(raw_timeout: object) -> tuple[float, Optional[str]]:
    if raw_timeout is None:
        return _DEFAULT_VERIFY_TIMEOUT_SECONDS, None
    if isinstance(raw_timeout, bool) or not isinstance(raw_timeout, (int, float)):
        return 0.0, "verify_timeout_seconds must be a non-negative number"

    timeout = float(raw_timeout)
    if timeout < 0:
        return 0.0, "verify_timeout_seconds must be a non-negative number"

    return min(timeout, _MAX_VERIFY_TIMEOUT_SECONDS), None


def _resolve_window_title(raw_window_title: object) -> tuple[Optional[str], Optional[str]]:
    if raw_window_title is None:
        return None, None
    if not isinstance(raw_window_title, str):
        return None, "verify_window_title must be a string"

    normalized = raw_window_title.strip()
    if not normalized:
        return None, None
    return normalized, None


def _infer_window_title(command: str, command_args: list[str]) -> Optional[str]:
    primary_token = _resolve_primary_token(command, command_args)
    if not primary_token:
        return None

    normalized_primary = Path(primary_token).name.lower()
    if normalized_primary in {"open", "xdg-open", "start", "cmd", "powershell.exe", "pwsh"}:
        if normalized_primary == "open" and command_args:
            for index, arg in enumerate(command_args):
                if arg == "-a" and index + 1 < len(command_args):
                    app_name = command_args[index + 1].strip()
                    if app_name:
                        return app_name
        return None

    inferred = Path(primary_token).stem.strip()
    if inferred.lower() in {"bash", "sh", "zsh", "fish", "python", "python3"}:
        return None
    return inferred or None


def _resolve_primary_token(command: str, command_args: list[str]) -> Optional[str]:
    if command_args:
        return command

    try:
        split_tokens = shlex.split(command, posix=not IS_WINDOWS)
    except ValueError:
        return command

    if not split_tokens:
        return command
    return split_tokens[0]


def _resolve_launch_argv(command: str, command_args: list[str]) -> list[str]:
    if command_args:
        return [command, *command_args]

    try:
        split_tokens = shlex.split(command, posix=not IS_WINDOWS)
    except ValueError as error:
        raise RuntimeError(f"Failed to parse command: {error}") from error

    if not split_tokens:
        raise RuntimeError("Command cannot be empty")
    return split_tokens


def _build_detached_popen_kwargs(working_directory: Optional[str]) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "cwd": working_directory,
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }

    if IS_WINDOWS:
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        creationflags |= getattr(subprocess, "DETACHED_PROCESS", 0)
        kwargs["creationflags"] = creationflags
    else:
        kwargs["start_new_session"] = True

    return kwargs


def _launch_detached_process(
    command: str,
    command_args: list[str],
    working_directory: Optional[str],
) -> Dict[str, Any]:
    argv = _resolve_launch_argv(command, command_args)
    started_at = time.time()

    try:
        process = subprocess.Popen(argv, **_build_detached_popen_kwargs(working_directory))
    except FileNotFoundError as error:
        raise RuntimeError(f"Executable not found: {argv[0]}") from error
    except PermissionError as error:
        raise RuntimeError(f"Permission denied launching app: {argv[0]}") from error
    except OSError as error:
        raise RuntimeError(f"Failed to launch app: {error}") from error

    return {
        "pid": process.pid,
        "argv": argv,
        "started_at": started_at,
    }


async def _verify_window_open(window_title: Optional[str], timeout_seconds: float) -> Dict[str, Any]:
    if not window_title:
        return {
            "verify_status": "skipped",
            "verified": False,
            "matched_window_title": None,
            "window_candidates": [],
        }

    last_windows: list[str] = []
    verification_error: Optional[str] = None
    deadline = time.monotonic() + max(timeout_seconds, 0.0)

    while True:
        windows_result = await get_open_windows({"filter_text": window_title})
        if windows_result.get("success"):
            data = windows_result.get("data")
            windows = data.get("windows") if isinstance(data, dict) else []
            last_windows = [
                title
                for title in windows
                if isinstance(title, str) and title.strip()
            ]
            if last_windows:
                return {
                    "verify_status": "verified",
                    "verified": True,
                    "matched_window_title": last_windows[0],
                    "window_candidates": last_windows[:5],
                }
        else:
            error_message = windows_result.get("error")
            if isinstance(error_message, str) and error_message.strip():
                verification_error = error_message.strip()

        now = time.monotonic()
        if now >= deadline:
            break

        await asyncio.sleep(min(_WINDOW_VERIFY_POLL_SECONDS, max(deadline - now, 0.0)))

    failure_payload: Dict[str, Any] = {
        "verify_status": "window_not_found",
        "verified": False,
        "matched_window_title": None,
        "window_candidates": last_windows[:5],
    }
    if verification_error:
        failure_payload["verify_error"] = verification_error
    return failure_payload


async def _capture_verification_screenshot(timeout_seconds: float) -> Dict[str, Any]:
    if timeout_seconds > 0:
        await asyncio.sleep(min(_SCREENSHOT_VERIFY_DELAY_SECONDS, timeout_seconds))

    screenshot_result = await capture_screenshot({})
    if screenshot_result.get("success") is not True:
        error_message = screenshot_result.get("error")
        return {
            "screenshot_error": (
                error_message.strip()
                if isinstance(error_message, str) and error_message.strip()
                else "Screenshot capture failed"
            )
        }

    data = screenshot_result.get("data")
    if not isinstance(data, dict):
        return {"screenshot_error": "Screenshot capture returned invalid payload"}

    screenshot_payload = {
        key: value
        for key, value in data.items()
        if key in {
            "screenshot_path",
            "screenshot_content_type",
            "compression",
            "size",
            "capture_meta",
        }
    }
    if "screenshot_path" not in screenshot_payload:
        screenshot_payload["screenshot_error"] = "Screenshot payload missing screenshot_path"
    return screenshot_payload


def _build_output(data: Dict[str, Any]) -> str:
    verify_status = data.get("verify_status")
    command = data.get("command")
    if verify_status == "verified":
        title = data.get("matched_window_title")
        return f"Launched '{command}' detached and verified open window: {title}"

    if verify_status == "screenshot_captured":
        return (
            f"Launched '{command}' detached. Window match was not confirmed in time, "
            "but a verification screenshot was captured."
        )

    if verify_status == "window_not_found":
        return (
            f"Launched '{command}' detached, but no matching window was detected before timeout. "
            "Use get_open_windows or screenshot to confirm UI state."
        )

    if verify_status == "screenshot_failed":
        return (
            f"Launched '{command}' detached. Verification screenshot failed; "
            "use get_open_windows or run screenshot tool directly."
        )

    return f"Launched '{command}' detached."
