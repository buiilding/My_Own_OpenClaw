"""
Shell Tool - Python implementation with background session support.
"""

import asyncio
import logging
import os
import platform
import shlex
import shutil
import time
try:
    import pty
except ImportError:  # pragma: no cover - Windows fallback
    pty = None
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

from tools.system.shell_process_registry import (
    ProcessSession,
    add_session,
    append_output,
    create_session_id,
    mark_backgrounded,
    mark_exited,
)
from tools.system.shell_process_control import (
    cancel_session_tasks,
    subprocess_group_launch_kwargs,
    terminate_session_process_tree,
)
from tools.system.shell_response_payloads import (
    build_background_response,
    build_foreground_response,
)
from tools.path_resolution import resolve_workspace_path

logger = logging.getLogger(__name__)

DEFAULT_SHELL_TIMEOUT = 120.0
IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"
_USE_SESSION_EXIT_CODE = object()
_SUDO_AUTH_FAILURE_EXIT_CODES = {126, 127}
_SUDO_AUTH_DENIED_MARKERS = (
    "not authorized",
    "authentication failure",
    "authentication dialog was dismissed",
    "request dismissed",
    "authorization failed",
    "user cancelled",
    "user canceled",
    "cancelled by user",
    "canceled by user",
)
_SUDO_IGNORED_FLAGS = {
    "-A",
    "--askpass",
    "-b",
    "--background",
    "-E",
    "--preserve-env",
    "-H",
    "--set-home",
    "-k",
    "--reset-timestamp",
    "-K",
    "--remove-timestamp",
    "-n",
    "--non-interactive",
    "-S",
    "--stdin",
    "-v",
    "--validate",
}
_SUDO_IGNORED_FLAGS_WITH_VALUE = {
    "-h",
    "--host",
    "-p",
    "--prompt",
    "-r",
    "--role",
    "-t",
    "--type",
    "-C",
}
def _resolve_shell_working_directory(raw_directory: object) -> Tuple[Optional[Path], Optional[str]]:
    resolved_path, normalized_input, path_error = resolve_workspace_path(raw_directory)
    if path_error:
        return None, "Directory must be a string"
    if resolved_path is None:
        return None, "Directory must be a string"

    if not resolved_path.exists() or not resolved_path.is_dir():
        requested_directory = normalized_input if normalized_input else str(resolved_path)
        return None, f"Directory does not exist or is not a directory: {requested_directory}"

    return resolved_path, None


async def run_shell_command(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute shell command.
    
    Args:
        args: Dictionary with 'command', 'directory', 'run_in_background', 'terminate_after_seconds',
              'yield_after_seconds', 'env', and optional 'pty'
        
    Returns:
        Dictionary with success status and command result
    """
    command = args.get("command", "").strip()
    directory = args.get("directory")
    run_in_background = args.get("run_in_background", False)
    terminate_after_seconds = args.get("terminate_after_seconds")
    yield_after_seconds = args.get("yield_after_seconds")
    env_overrides = args.get("env")
    pty_requested = bool(args.get("pty", False))
    
    if not command:
        return {"success": False, "error": "Command cannot be empty"}
    
    try:
        working_dir, directory_error = _resolve_shell_working_directory(directory)
        if directory_error:
            return {"success": False, "error": directory_error}

        warnings = []
        if pty_requested and (IS_WINDOWS or pty is None):
            warnings.append("PTY requested but not supported in this sidecar; running without PTY.")

        exec_command, sudo_auth_routed, sudo_error = _rewrite_sudo_command_for_os_prompt(
            command,
        )
        if sudo_error:
            return {"success": False, "error": sudo_error}

        env = _build_env(env_overrides)
        session, wait_task = await _start_shell_session(
            display_command=command,
            execution_command=exec_command,
            working_dir=working_dir,
            env=env,
            pty_requested=pty_requested,
        )

        if run_in_background:
            mark_backgrounded(session)
            return build_background_response(session, warnings)

        if yield_after_seconds is not None:
            if yield_after_seconds <= 0:
                mark_backgrounded(session)
                return build_background_response(session, warnings)
            done, _ = await asyncio.wait({wait_task}, timeout=yield_after_seconds)
            if not done:
                mark_backgrounded(session)
                return build_background_response(session, warnings)
            result = _build_result_from_session(session, timed_out=False)
            if sudo_auth_routed:
                result = _normalize_sudo_auth_result(result)
            return build_foreground_response(
                command,
                working_dir,
                result,
                warnings,
            )

        timeout = terminate_after_seconds if terminate_after_seconds is not None else DEFAULT_SHELL_TIMEOUT
        try:
            if timeout is None:
                await wait_task
            else:
                await asyncio.wait_for(asyncio.shield(wait_task), timeout=timeout)
            result = _build_result_from_session(session, timed_out=False)
        except asyncio.TimeoutError:
            await _terminate_session(session)
            if not wait_task.done():
                try:
                    await asyncio.wait_for(wait_task, timeout=2.0)
                except asyncio.TimeoutError:
                    wait_task.cancel()
                    await asyncio.gather(wait_task, return_exceptions=True)
            if not session.exited:
                exit_code = session.process.returncode
                status = "completed" if exit_code == 0 else "failed"
                mark_exited(session, exit_code, status)
            result = _build_result_from_session(
                session,
                timed_out=True,
                exit_code_override=None,
                error_override="Command timed out and was terminated",
            )
        if sudo_auth_routed:
            result = _normalize_sudo_auth_result(result)
        return build_foreground_response(
            command,
            working_dir,
            result,
            warnings,
        )
    except Exception as e:
        logger.error(f"Error executing shell command: {e}", exc_info=True)
        return {"success": False, "error": f"Failed to execute command: {str(e)}"}


async def _start_shell_session(
    display_command: str,
    execution_command: str,
    working_dir: Path,
    env: Dict[str, str],
    pty_requested: bool,
) -> Tuple[ProcessSession, asyncio.Task]:
    shell_cmd, shell_args = _resolve_shell_command(execution_command)
    use_pty = False
    master_fd = None
    stdin = asyncio.subprocess.PIPE
    stdout = asyncio.subprocess.PIPE
    stderr = asyncio.subprocess.PIPE

    slave_fd = None
    if not IS_WINDOWS and pty_requested and pty is not None:
        master_fd, slave_fd = pty.openpty()
        stdin = slave_fd
        stdout = slave_fd
        stderr = slave_fd
        use_pty = True

    process = await asyncio.create_subprocess_exec(
        shell_cmd,
        *shell_args,
        cwd=working_dir,
        env=env,
        stdin=stdin,
        stdout=stdout,
        stderr=stderr,
        **subprocess_group_launch_kwargs(),
    )

    if use_pty and master_fd is not None and slave_fd is not None:
        try:
            os.close(slave_fd)
        except OSError:
            pass
        try:
            os.set_blocking(master_fd, True)
        except AttributeError:
            pass
    session = ProcessSession(
        id=create_session_id(),
        command=display_command,
        cwd=str(working_dir),
        process=process,
        started_at=time.time(),
        pty_master=master_fd,
        uses_pty=use_pty,
        loop=asyncio.get_running_loop(),
    )
    add_session(session)

    read_tasks: List[asyncio.Task] = []
    if use_pty and master_fd is not None:
        read_tasks.append(asyncio.create_task(_read_pty_output(session, master_fd)))
    else:
        read_tasks.append(asyncio.create_task(_read_stream(session, process.stdout, "stdout")))
        read_tasks.append(asyncio.create_task(_read_stream(session, process.stderr, "stderr")))

    wait_task = asyncio.create_task(_wait_for_exit(session, read_tasks))
    session.read_tasks = read_tasks
    session.wait_task = wait_task
    return session, wait_task


def _rewrite_sudo_command_for_os_prompt(
    command: str,
) -> Tuple[str, bool, Optional[str]]:
    """
    Rewrite leading sudo commands to pkexec so auth is handled by OS prompt.

    Returns:
      (execution_command, sudo_auth_routed, error_message)
    """
    stripped = command.strip()

    if not IS_LINUX or not stripped.startswith("sudo"):
        return command, False, None

    if shutil.which("pkexec") is None:
        return (
            command,
            False,
            "Cannot run sudo command: OS authentication prompt is unavailable (pkexec not found).",
        )

    try:
        tokens = shlex.split(command, posix=True)
    except ValueError as exc:
        return command, False, f"Cannot parse sudo command: {exc}"

    if not tokens or tokens[0] != "sudo":
        return command, False, None

    target_user = None
    index = 1
    while index < len(tokens):
        token = tokens[index]
        if token == "--":
            index += 1
            break
        if token in ("-u", "--user"):
            if index + 1 >= len(tokens):
                return command, False, "Invalid sudo command: missing user after -u/--user."
            target_user = tokens[index + 1]
            index += 2
            continue
        if token.startswith("-u") and len(token) > 2:
            target_user = token[2:]
            index += 1
            continue
        if token in _SUDO_IGNORED_FLAGS:
            index += 1
            continue
        if token in _SUDO_IGNORED_FLAGS_WITH_VALUE:
            if index + 1 >= len(tokens):
                return command, False, f"Invalid sudo command: missing value for {token}."
            index += 2
            continue
        if token.startswith("-"):
            return (
                command,
                False,
                f"Unsupported sudo option for OS prompt flow: {token}",
            )
        break

    if index >= len(tokens):
        return command, False, "Invalid sudo command: missing command to execute."

    inner_command = shlex.join(tokens[index:])
    pkexec_tokens = ["pkexec"]
    if target_user and target_user != "root":
        pkexec_tokens.extend(["--user", target_user])
    pkexec_tokens.extend(["bash", "-lc", inner_command])
    return shlex.join(pkexec_tokens), True, None


def _normalize_sudo_auth_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize pkexec auth cancellation/denial into a stable tool-visible error.
    """
    exit_code = result.get("exit_code")
    error_text = (result.get("error") or "").strip()
    lower_error = error_text.lower()
    has_denied_marker = bool(
        lower_error and any(marker in lower_error for marker in _SUDO_AUTH_DENIED_MARKERS)
    )

    if not has_denied_marker and exit_code not in _SUDO_AUTH_FAILURE_EXIT_CODES:
        return result

    if lower_error and not has_denied_marker:
        return result

    result["error"] = "User canceled or denied the OS authentication prompt for this sudo command."
    return result


async def _read_stream(
    session: ProcessSession,
    stream: Optional[asyncio.StreamReader],
    stream_name: str,
) -> None:
    if not stream:
        return
    while True:
        chunk = await stream.read(4096)
        if not chunk:
            break
        append_output(session, stream_name, chunk.decode("utf-8", errors="replace"))


async def _read_pty_output(session: ProcessSession, master_fd: int) -> None:
    while True:
        try:
            chunk = await asyncio.to_thread(os.read, master_fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        append_output(session, "stdout", chunk.decode("utf-8", errors="replace"))


async def _wait_for_exit(
    session: ProcessSession,
    read_tasks: List[asyncio.Task],
) -> None:
    exit_code = await session.process.wait()
    if session.uses_pty and session.pty_master is not None:
        try:
            os.close(session.pty_master)
        except OSError:
            pass
        session.pty_master = None
    if read_tasks:
        try:
            await asyncio.wait_for(
                asyncio.gather(*read_tasks, return_exceptions=True),
                timeout=1.0,
            )
        except asyncio.TimeoutError:
            for task in read_tasks:
                task.cancel()
            await asyncio.gather(*read_tasks, return_exceptions=True)
    status = "completed" if exit_code == 0 else "failed"
    mark_exited(session, exit_code, status)


async def _terminate_session(session: ProcessSession) -> None:
    if session.exited:
        return
    await terminate_session_process_tree(session)
    if session.wait_task and not session.wait_task.done():
        try:
            await asyncio.wait_for(session.wait_task, timeout=1.0)
        except asyncio.TimeoutError:
            await cancel_session_tasks(session)


def _resolve_shell_command(command: str) -> Tuple[str, list]:
    if IS_WINDOWS:
        return "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]
    return "bash", ["-c", command]


def _build_env(overrides: Any) -> Dict[str, str]:
    env = os.environ.copy()
    if isinstance(overrides, dict):
        for key, value in overrides.items():
            if not isinstance(key, str):
                continue
            env[key] = str(value)
    return env


def _build_result_from_session(
    session: ProcessSession,
    timed_out: bool,
    exit_code_override: Any = _USE_SESSION_EXIT_CODE,
    error_override: Optional[str] = None,
) -> Dict[str, Any]:
    execution_time = time.time() - session.started_at
    exit_code = session.exit_code if exit_code_override is _USE_SESSION_EXIT_CODE else exit_code_override
    error_text = error_override if error_override is not None else session.stderr_aggregated
    return {
        "output": session.stdout_aggregated,
        "error": error_text,
        "exit_code": exit_code,
        "execution_time": execution_time,
        "timed_out": timed_out,
    }
