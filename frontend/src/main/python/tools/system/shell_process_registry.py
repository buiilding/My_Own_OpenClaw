"""
Shell process registry for background command sessions.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

DEFAULT_JOB_TTL_SECONDS = 30 * 60
MIN_JOB_TTL_SECONDS = 60
MAX_JOB_TTL_SECONDS = 3 * 60 * 60
DEFAULT_MAX_OUTPUT_CHARS = 200_000
DEFAULT_PENDING_MAX_OUTPUT_CHARS = 30_000
DEFAULT_TAIL_CHARS = 2000


def _clamp(value: Optional[int], min_value: int, max_value: int, default: int) -> int:
    if value is None:
        return default
    return min(max(value, min_value), max_value)


def _read_env_int(name: str) -> Optional[int]:
    raw = os.environ.get(name)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


job_ttl_seconds = _clamp(
    _read_env_int("WINDIE_SHELL_JOB_TTL_SECONDS"),
    MIN_JOB_TTL_SECONDS,
    MAX_JOB_TTL_SECONDS,
    DEFAULT_JOB_TTL_SECONDS,
)


@dataclass
class ProcessSession:
    id: str
    command: str
    cwd: str
    process: asyncio.subprocess.Process
    started_at: float
    pty_master: Optional[int] = None
    uses_pty: bool = False
    backgrounded: bool = False
    exited: bool = False
    exit_code: Optional[int] = None
    total_output_chars: int = 0
    stdout_aggregated: str = ""
    stderr_aggregated: str = ""
    stdout_tail: str = ""
    stderr_tail: str = ""
    aggregated: str = ""
    tail: str = ""
    truncated: bool = False
    max_output_chars: int = DEFAULT_MAX_OUTPUT_CHARS
    pending_max_output_chars: int = DEFAULT_PENDING_MAX_OUTPUT_CHARS
    pending_stdout: List[str] = field(default_factory=list)
    pending_stderr: List[str] = field(default_factory=list)
    pending_stdout_chars: int = 0
    pending_stderr_chars: int = 0
    read_tasks: List[asyncio.Task] = field(default_factory=list, repr=False)
    wait_task: Optional[asyncio.Task] = field(default=None, repr=False)
    loop: Optional[asyncio.AbstractEventLoop] = field(default=None, repr=False)


@dataclass
class FinishedSession:
    id: str
    command: str
    cwd: str
    started_at: float
    ended_at: float
    status: str
    exit_code: Optional[int]
    aggregated: str
    tail: str
    stdout: str
    stderr: str
    stdout_tail: str
    stderr_tail: str
    truncated: bool
    total_output_chars: int


_running_sessions: Dict[str, ProcessSession] = {}
_finished_sessions: Dict[str, FinishedSession] = {}
_sweeper_task: Optional[asyncio.Task] = None


def create_session_id() -> str:
    return uuid.uuid4().hex


def add_session(session: ProcessSession) -> None:
    _running_sessions[session.id] = session
    _start_sweeper()


def get_session(session_id: str) -> Optional[ProcessSession]:
    return _running_sessions.get(session_id)


def get_finished_session(session_id: str) -> Optional[FinishedSession]:
    return _finished_sessions.get(session_id)


def list_running_sessions() -> List[ProcessSession]:
    return [session for session in _running_sessions.values() if session.backgrounded]


def list_finished_sessions() -> List[FinishedSession]:
    return list(_finished_sessions.values())


def delete_session(session_id: str) -> None:
    _running_sessions.pop(session_id, None)
    _finished_sessions.pop(session_id, None)


def clear_finished() -> int:
    count = len(_finished_sessions)
    _finished_sessions.clear()
    return count


def append_output(session: ProcessSession, stream: str, chunk: str) -> None:
    if not chunk:
        return
    buffer = session.pending_stdout if stream == "stdout" else session.pending_stderr
    buffer_chars = session.pending_stdout_chars if stream == "stdout" else session.pending_stderr_chars
    pending_cap = min(session.pending_max_output_chars, session.max_output_chars)
    buffer.append(chunk)
    buffer_chars += len(chunk)
    if buffer_chars > pending_cap:
        session.truncated = True
        buffer_chars = _cap_pending_buffer(buffer, buffer_chars, pending_cap)
    if stream == "stdout":
        session.pending_stdout_chars = buffer_chars
    else:
        session.pending_stderr_chars = buffer_chars
    session.total_output_chars += len(chunk)
    expected_length = len(session.aggregated) + len(chunk)
    session.aggregated = _trim_with_cap(session.aggregated + chunk, session.max_output_chars)
    session.truncated = session.truncated or len(session.aggregated) < expected_length
    session.tail = tail(session.aggregated, DEFAULT_TAIL_CHARS)

    if stream == "stdout":
        expected_stdout_length = len(session.stdout_aggregated) + len(chunk)
        session.stdout_aggregated = _trim_with_cap(
            session.stdout_aggregated + chunk, session.max_output_chars
        )
        session.truncated = session.truncated or len(session.stdout_aggregated) < expected_stdout_length
        session.stdout_tail = tail(session.stdout_aggregated, DEFAULT_TAIL_CHARS)
    else:
        expected_stderr_length = len(session.stderr_aggregated) + len(chunk)
        session.stderr_aggregated = _trim_with_cap(
            session.stderr_aggregated + chunk, session.max_output_chars
        )
        session.truncated = session.truncated or len(session.stderr_aggregated) < expected_stderr_length
        session.stderr_tail = tail(session.stderr_aggregated, DEFAULT_TAIL_CHARS)


def drain_pending(session: ProcessSession) -> tuple[str, str]:
    stdout = "".join(session.pending_stdout)
    stderr = "".join(session.pending_stderr)
    session.pending_stdout = []
    session.pending_stderr = []
    session.pending_stdout_chars = 0
    session.pending_stderr_chars = 0
    return stdout, stderr


def mark_backgrounded(session: ProcessSession) -> None:
    session.backgrounded = True


def mark_exited(session: ProcessSession, exit_code: Optional[int], status: str) -> None:
    session.exited = True
    session.exit_code = exit_code
    session.tail = tail(session.aggregated, DEFAULT_TAIL_CHARS)
    session.stdout_tail = tail(session.stdout_aggregated, DEFAULT_TAIL_CHARS)
    session.stderr_tail = tail(session.stderr_aggregated, DEFAULT_TAIL_CHARS)
    if session.backgrounded:
        _running_sessions.pop(session.id, None)
        _finished_sessions[session.id] = FinishedSession(
            id=session.id,
            command=session.command,
            cwd=session.cwd,
            started_at=session.started_at,
            ended_at=time.time(),
            status=status,
            exit_code=exit_code,
            aggregated=session.aggregated,
            tail=session.tail,
            stdout=session.stdout_aggregated,
            stderr=session.stderr_aggregated,
            stdout_tail=session.stdout_tail,
            stderr_tail=session.stderr_tail,
            truncated=session.truncated,
            total_output_chars=session.total_output_chars,
        )
    else:
        _running_sessions.pop(session.id, None)


def tail(text: str, max_chars: int = DEFAULT_TAIL_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


def _cap_pending_buffer(buffer: List[str], pending_chars: int, cap: int) -> int:
    if pending_chars <= cap:
        return pending_chars
    last = buffer[-1] if buffer else None
    if last and len(last) >= cap:
        buffer.clear()
        buffer.append(last[-cap:])
        return cap
    while buffer and pending_chars - len(buffer[0]) >= cap:
        pending_chars -= len(buffer[0])
        buffer.pop(0)
    if buffer and pending_chars > cap:
        overflow = pending_chars - cap
        buffer[0] = buffer[0][overflow:]
        pending_chars = cap
    return pending_chars


def _trim_with_cap(text: str, cap: int) -> str:
    if len(text) <= cap:
        return text
    return text[-cap:]


def _prune_finished() -> None:
    cutoff = time.time() - job_ttl_seconds
    for session_id, session in list(_finished_sessions.items()):
        if session.ended_at < cutoff:
            _finished_sessions.pop(session_id, None)


async def _sweeper() -> None:
    interval = max(30, job_ttl_seconds // 6)
    while True:
        await asyncio.sleep(interval)
        _prune_finished()


def _start_sweeper() -> None:
    global _sweeper_task
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    if _sweeper_task and not _sweeper_task.done():
        return
    _sweeper_task = loop.create_task(_sweeper())


def reset_registry_for_tests() -> None:
    global _sweeper_task
    _running_sessions.clear()
    _finished_sessions.clear()
    if _sweeper_task and not _sweeper_task.done():
        try:
            loop = asyncio.get_running_loop()
            if not loop.is_closed():
                _sweeper_task.cancel()
        except RuntimeError:
            pass
    _sweeper_task = None


async def shutdown_registry_for_tests() -> None:
    global _sweeper_task
    current_loop = asyncio.get_running_loop()
    sessions = list(_running_sessions.values())
    _running_sessions.clear()
    _finished_sessions.clear()

    sweeper_task = _sweeper_task
    _sweeper_task = None
    if sweeper_task and not sweeper_task.done():
        try:
            sweeper_loop = sweeper_task.get_loop()
        except AttributeError:
            sweeper_loop = None
        if sweeper_loop is current_loop or sweeper_loop is None:
            sweeper_task.cancel()
            await asyncio.gather(sweeper_task, return_exceptions=True)
        else:
            with contextlib.suppress(Exception):
                sweeper_task.cancel()

    cleanup_tasks: List[asyncio.Task] = []
    for session in sessions:
        same_loop = session.loop is current_loop
        if same_loop and session.wait_task and not session.wait_task.done():
            try:
                await asyncio.wait_for(session.wait_task, timeout=1.0)
                continue
            except asyncio.TimeoutError:
                pass
            except asyncio.CancelledError:
                continue
            if session.process and session.process.returncode is None:
                with contextlib.suppress(ProcessLookupError, Exception):
                    session.process.kill()
            with contextlib.suppress(asyncio.TimeoutError, asyncio.CancelledError, Exception):
                await asyncio.wait_for(session.wait_task, timeout=1.0)
            if session.wait_task.done():
                continue
            session.wait_task.cancel()
            cleanup_tasks.append(session.wait_task)
        if not same_loop and session.process and session.process.returncode is None:
            with contextlib.suppress(ProcessLookupError, Exception):
                session.process.kill()
        if session.wait_task and not session.wait_task.done() and not same_loop:
            with contextlib.suppress(Exception):
                session.wait_task.cancel()
        for task in session.read_tasks:
            if not task.done():
                task.cancel()
                if same_loop:
                    cleanup_tasks.append(task)
        if session.uses_pty and session.pty_master is not None:
            try:
                os.close(session.pty_master)
            except OSError:
                pass
            session.pty_master = None

    if cleanup_tasks:
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(
                asyncio.gather(*cleanup_tasks, return_exceptions=True),
                timeout=1.0,
            )

    for session in sessions:
        if session.loop is current_loop and session.process and session.process.returncode is None:
            with contextlib.suppress(asyncio.TimeoutError, Exception):
                await asyncio.wait_for(session.process.wait(), timeout=1.0)
