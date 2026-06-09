"""
Process-control helpers for shell sessions.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import platform
import signal
from typing import Dict

from tools.system.shell_process_registry import ProcessSession

IS_WINDOWS = platform.system() == "Windows"
_PROCESS_EXIT_POLL_SECONDS = 0.05


def subprocess_group_launch_kwargs() -> Dict[str, bool]:
    if IS_WINDOWS:
        return {}
    return {"start_new_session": True}


async def terminate_session_process_tree(
    session: ProcessSession,
    *,
    graceful_wait_seconds: float = 0.5,
    kill_wait_seconds: float = 1.0,
) -> bool:
    if session.process.returncode is not None:
        return True

    _send_session_signal(session, signal.SIGTERM)
    if await _wait_for_process_returncode(session, graceful_wait_seconds):
        return True

    _send_session_signal(session, signal.SIGKILL)
    return await _wait_for_process_returncode(session, kill_wait_seconds)


async def cancel_session_tasks(session: ProcessSession) -> None:
    tasks = []
    if session.wait_task and not session.wait_task.done():
        session.wait_task.cancel()
        tasks.append(session.wait_task)
    for task in session.read_tasks:
        if not task.done():
            task.cancel()
            tasks.append(task)
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    if session.uses_pty and session.pty_master is not None:
        with contextlib.suppress(OSError):
            os.close(session.pty_master)
        session.pty_master = None


async def _wait_for_process_returncode(
    session: ProcessSession,
    timeout_seconds: float,
) -> bool:
    deadline = asyncio.get_running_loop().time() + max(timeout_seconds, 0.0)
    while session.process.returncode is None:
        if asyncio.get_running_loop().time() >= deadline:
            return False
        await asyncio.sleep(_PROCESS_EXIT_POLL_SECONDS)
    return True


def _send_session_signal(session: ProcessSession, sig: signal.Signals) -> None:
    process = session.process
    if process.returncode is not None:
        return

    if IS_WINDOWS:
        if sig == signal.SIGTERM:
            process.terminate()
        else:
            process.kill()
        return

    try:
        process_group_id = os.getpgid(process.pid)
        if process_group_id != os.getpgrp():
            os.killpg(process_group_id, sig)
            return
    except ProcessLookupError:
        return
    except Exception:
        pass

    with contextlib.suppress(ProcessLookupError):
        process.send_signal(sig)
