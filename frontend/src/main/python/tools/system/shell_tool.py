"""
Shell Tool - Python implementation with background session support.
"""

import asyncio
import logging
import os
import platform
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

logger = logging.getLogger(__name__)

DEFAULT_SHELL_TIMEOUT = 120.0
IS_WINDOWS = platform.system() == "Windows"
DEFAULT_MAX_OUTPUT_TOKENS = 10_000
APPROX_BYTES_PER_TOKEN = 4


def _approx_token_count(text: str) -> int:
    if not text:
        return 0
    return (len(text) + (APPROX_BYTES_PER_TOKEN - 1)) // APPROX_BYTES_PER_TOKEN


def _truncate_text_for_tokens(content: str, max_tokens: int) -> tuple[str, bool, int]:
    """Truncate content with a head+tail marker using an approximate token budget."""
    original_tokens = _approx_token_count(content)
    max_chars = max_tokens * APPROX_BYTES_PER_TOKEN

    if len(content) <= max_chars:
        return content, False, original_tokens

    if max_chars <= 0:
        return f"…{original_tokens} tokens truncated…", True, original_tokens

    left_budget = max_chars // 2
    right_budget = max_chars - left_budget
    prefix = content[:left_budget]
    suffix = content[-right_budget:] if right_budget > 0 else ""
    removed_chars = max(0, len(content) - max_chars)
    removed_tokens = (removed_chars + (APPROX_BYTES_PER_TOKEN - 1)) // APPROX_BYTES_PER_TOKEN
    total_lines = len(content.splitlines())
    truncated = f"{prefix}…{removed_tokens} tokens truncated…{suffix}"
    return f"Total output lines: {total_lines}\n\n{truncated}", True, original_tokens


def _resolve_max_output_tokens(raw_value: Any) -> tuple[Optional[int], Optional[str]]:
    if raw_value is None:
        return DEFAULT_MAX_OUTPUT_TOKENS, None
    if isinstance(raw_value, bool) or not isinstance(raw_value, int):
        return None, "max_output_tokens must be an integer"
    if raw_value <= 0:
        return None, "max_output_tokens must be greater than zero"
    return raw_value, None


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
    max_output_tokens, max_output_error = _resolve_max_output_tokens(args.get("max_output_tokens"))
    
    if not command:
        return {"success": False, "error": "Command cannot be empty"}
    if max_output_error:
        return {"success": False, "error": max_output_error}
    
    try:
        # Determine working directory
        working_dir = directory
        if working_dir:
            working_path = Path(working_dir)
            if not working_path.is_absolute():
                return {"success": False, "error": "Directory must be an absolute path"}
            if not working_path.exists() or not working_path.is_dir():
                return {"success": False, "error": f"Directory does not exist or is not a directory: {working_dir}"}
        else:
            # Use OS home directory as stable default for new shell invocations.
            working_dir = Path.home()
        
        warnings = []
        if pty_requested and (IS_WINDOWS or pty is None):
            warnings.append("PTY requested but not supported in this sidecar; running without PTY.")

        env = _build_env(env_overrides)
        session, wait_task = await _start_shell_session(command, working_dir, env, pty_requested)

        if run_in_background:
            mark_backgrounded(session)
            return _build_background_response(session, warnings)

        if yield_after_seconds is not None:
            if yield_after_seconds <= 0:
                mark_backgrounded(session)
                return _build_background_response(session, warnings)
            done, _ = await asyncio.wait({wait_task}, timeout=yield_after_seconds)
            if not done:
                mark_backgrounded(session)
                return _build_background_response(session, warnings)
            result = _build_result_from_session(session, timed_out=False)
            return _build_foreground_response(
                command,
                working_dir,
                result,
                warnings,
                max_output_tokens=max_output_tokens or DEFAULT_MAX_OUTPUT_TOKENS,
            )

        timeout = terminate_after_seconds if terminate_after_seconds is not None else DEFAULT_SHELL_TIMEOUT
        try:
            if timeout is None:
                await wait_task
            else:
                await asyncio.wait_for(wait_task, timeout=timeout)
            result = _build_result_from_session(session, timed_out=False)
        except asyncio.TimeoutError:
            await _terminate_session(session)
            # wait_task was cancelled by wait_for; don't await it
            result = _build_result_from_session(
                session,
                timed_out=True,
                exit_code_override=None,
                error_override="Command timed out and was terminated",
            )
        return _build_foreground_response(
            command,
            working_dir,
            result,
            warnings,
            max_output_tokens=max_output_tokens or DEFAULT_MAX_OUTPUT_TOKENS,
        )
    except Exception as e:
        logger.error(f"Error executing shell command: {e}", exc_info=True)
        return {"success": False, "error": f"Failed to execute command: {str(e)}"}


async def _start_shell_session(
    command: str,
    working_dir: Path,
    env: Dict[str, str],
    pty_requested: bool,
) -> Tuple[ProcessSession, asyncio.Task]:
    shell_cmd, shell_args = _resolve_shell_command(command)
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
        command=command,
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
    session.process.kill()
    await session.process.wait()


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


def _build_background_response(session: ProcessSession, warnings: list) -> Dict[str, Any]:
    warning_text = f" Warnings: {'; '.join(warnings)}" if warnings else ""
    return {
        "success": True,
        "data": {
            "command": session.command,
            "working_directory": session.cwd,
            "status": "running",
            "session_id": session.id,
            "pid": session.process.pid,
            "pty": session.uses_pty,
            "tail": session.tail,
            "warnings": warnings,
            "llm_content": (
                f"Command '{session.command}' is running in the background (session {session.id})."
                " Use the process tool to poll or manage it."
            ),
            "return_display": f"Command running in background (session {session.id}).{warning_text}",
        },
    }


def _build_foreground_response(
    command: str,
    working_dir: Path,
    result: Dict[str, Any],
    warnings: list,
    max_output_tokens: int,
) -> Dict[str, Any]:
    llm_content, output_truncated, original_output_tokens = _format_llm_output(
        command,
        working_dir,
        result,
        max_output_tokens,
    )
    return_display = _format_display_output(result)
    if warnings:
        return_display = f"{return_display}\nWarnings: {'; '.join(warnings)}"
    success = result["exit_code"] == 0 or result["exit_code"] is None
    return {
        "success": success,
        "data": {
            "command": command,
            "working_directory": str(working_dir),
            "output": result["output"],
            "error": result["error"],
            "exit_code": result["exit_code"],
            "execution_time": result["execution_time"],
            "timed_out": result["timed_out"],
            "warnings": warnings,
            "output_token_limit": max_output_tokens,
            "original_output_tokens": original_output_tokens,
            "output_truncated": output_truncated,
            "llm_content": llm_content,
            "return_display": return_display,
        },
    }


def _build_result_from_session(
    session: ProcessSession,
    timed_out: bool,
    exit_code_override: Optional[int] = None,
    error_override: Optional[str] = None,
) -> Dict[str, Any]:
    execution_time = time.time() - session.started_at
    exit_code = exit_code_override if exit_code_override is not None else session.exit_code
    error_text = error_override if error_override is not None else session.stderr_aggregated
    return {
        "output": session.stdout_aggregated,
        "error": error_text,
        "exit_code": exit_code,
        "execution_time": execution_time,
        "timed_out": timed_out,
    }


def _format_llm_output(
    command: str,
    working_dir: Path,
    result: Dict[str, Any],
    max_output_tokens: int,
) -> tuple[str, bool, int]:
    """Format output for LLM."""
    parts = [
        f"Command: {command}",
        f"Directory: {working_dir}",
    ]

    output_sections = []
    if result["output"]:
        output_sections.append(f"Output:\n{result['output']}")
    if result["error"]:
        output_sections.append(f"Error:\n{result['error']}")

    output_block = "\n\n".join(output_sections)
    truncated = False
    original_output_tokens = 0
    if output_block:
        output_block, truncated, original_output_tokens = _truncate_text_for_tokens(
            output_block,
            max_output_tokens,
        )
        parts.append(output_block)

    if result["exit_code"] is not None:
        parts.append(f"Exit Code: {result['exit_code']}")

    if result["timed_out"]:
        parts.append("Status: Command timed out and was terminated")
    elif result["exit_code"] == 0:
        parts.append("Status: Success")
    else:
        parts.append("Status: Failed (non-zero exit code)")

    parts.append(f"Execution Time: {result['execution_time']:.2f} seconds")
    if truncated:
        parts.append(f"Original output token count: {original_output_tokens}")

    return "\n".join(parts), truncated, original_output_tokens


def _format_display_output(result: Dict[str, Any]) -> str:
    """Format output for display."""
    if result["timed_out"]:
        status = "Command timed out and was terminated"
    elif result["exit_code"] == 0:
        status = "Command completed successfully"
    elif result["exit_code"] is not None:
        status = f"Command failed with exit code {result['exit_code']}"
    else:
        status = "Command execution completed"
    
    output_lines = []
    if result["output"]:
        output_lines.append(f"Output:\n{result['output']}")
    if result["error"]:
        output_lines.append(f"Error:\n{result['error']}")
    
    output_text = "\n".join(output_lines) if output_lines else "No output"
    
    return f"{status}\n{output_text}"
