"""
Process tool for managing background shell sessions.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional

from tools.result import ToolResult
from tools.system.shell_process_control import (
    cancel_session_tasks,
    terminate_session_process_tree,
)
from tools.system.shell_process_registry import (
    clear_finished,
    delete_session,
    drain_pending,
    get_finished_session,
    get_session,
    list_finished_sessions,
    list_running_sessions,
    mark_exited,
)

logger = logging.getLogger(__name__)


def _success(data: Dict[str, Any]) -> ToolResult:
    return ToolResult.success_result(data)


def _error(message: str) -> ToolResult:
    return ToolResult.error_result(message)


def _normalize_action(action: Optional[str]) -> str:
    return (action or "").strip().lower().replace("_", "-")


def _encode_keys(keys: Optional[List[str]], hex_bytes: Optional[List[str]], literal: Optional[str]) -> tuple[bytes, List[str]]:
    warnings: List[str] = []
    payload = b""

    key_map = {
        "enter": b"\r",
        "return": b"\r",
        "tab": b"\t",
        "backspace": b"\x7f",
        "esc": b"\x1b",
        "escape": b"\x1b",
        "up": b"\x1b[A",
        "down": b"\x1b[B",
        "right": b"\x1b[C",
        "left": b"\x1b[D",
        "c-c": b"\x03",
        "c-d": b"\x04",
    }

    if keys is not None:
        if not isinstance(keys, list):
            warnings.append("keys must be a list of strings")
        else:
            for key in keys:
                if not isinstance(key, str):
                    warnings.append(f"Ignored non-string key token: {key!r}")
                    continue
                token = key.strip().lower()
                if not token:
                    continue
                payload += key_map.get(token, key.encode("utf-8", errors="replace"))

    if hex_bytes is not None:
        if not isinstance(hex_bytes, list):
            warnings.append("hex must be a list of hex strings")
        else:
            for entry in hex_bytes:
                if not isinstance(entry, str):
                    warnings.append(f"Ignored non-string hex byte: {entry!r}")
                    continue
                if not entry:
                    continue
                try:
                    payload += bytes.fromhex(entry)
                except ValueError:
                    warnings.append(f"Invalid hex byte: {entry}")

    if literal is not None:
        if isinstance(literal, str):
            payload += literal.encode("utf-8", errors="replace")
        else:
            warnings.append("Ignored non-string literal payload")

    return payload, warnings


def _encode_paste(text: str, bracketed: bool) -> bytes:
    payload = text.encode("utf-8", errors="replace")
    if not bracketed:
        return payload
    return b"\x1b[200~" + payload + b"\x1b[201~"


def _slice_log_lines(text: str, offset: Optional[int], limit: Optional[int]) -> Dict[str, Any]:
    lines = text.splitlines()
    total = len(lines)
    start = max(offset or 0, 0)
    end = total if limit is None else min(start + max(limit, 0), total)
    slice_lines = lines[start:end]
    return {
        "slice": "\n".join(slice_lines),
        "total_lines": total,
    }


async def _write_to_session(session, data: bytes, close: bool) -> None:
    if session.uses_pty:
        if session.exited or session.pty_master is None:
            raise RuntimeError("Session stdin is not writable.")
        await asyncio.to_thread(os.write, session.pty_master, data)
        if close:
            await asyncio.to_thread(os.write, session.pty_master, b"\x04")
        return

    stdin = session.process.stdin
    if not stdin or stdin.is_closing():
        raise RuntimeError("Session stdin is not writable.")
    stdin.write(data)
    await stdin.drain()
    if close:
        stdin.close()


async def process_shell_command(args: Dict[str, Any]) -> ToolResult:
    """
    Manage background shell sessions (list, poll, log, write, send-keys, submit, paste, kill, clear, remove).
    """
    action = _normalize_action(args.get("action"))
    session_id = args.get("session_id")

    if action == "list":
        running = [
            {
                "session_id": session.id,
                "status": "running",
                "pid": session.process.pid,
                "started_at": session.started_at,
                "runtime_seconds": max(0.0, time.time() - session.started_at),
                "cwd": session.cwd,
                "command": session.command,
                "pty": session.uses_pty,
                "tail": session.tail,
                "truncated": session.truncated,
            }
            for session in list_running_sessions()
        ]
        finished = [
            {
                "session_id": session.id,
                "status": session.status,
                "started_at": session.started_at,
                "ended_at": session.ended_at,
                "runtime_seconds": max(0.0, session.ended_at - session.started_at),
                "cwd": session.cwd,
                "command": session.command,
                "tail": session.tail,
                "truncated": session.truncated,
                "exit_code": session.exit_code,
            }
            for session in list_finished_sessions()
        ]
        return _success(
            {
                "running": running,
                "finished": finished,
                "output": f"{len(running)} running, {len(finished)} finished session(s).",
                "message": f"{len(running)} running, {len(finished)} finished session(s).",
            }
        )

    if action == "clear":
        cleared = clear_finished()
        return _success(
            {
                "cleared": cleared,
                "output": f"Cleared {cleared} finished session(s).",
                "message": f"Cleared {cleared} finished session(s).",
            }
        )

    if not session_id:
        return _error("session_id is required for this action")

    session = get_session(session_id)
    finished = get_finished_session(session_id)

    if action in {"poll", "log", "write", "send-keys", "submit", "paste", "kill", "remove"}:
        if not session and not finished:
            return _error(f"No session found for {session_id}")

    if action == "poll":
        if not session:
            return _success(
                {
                    "status": finished.status,
                    "session_id": session_id,
                    "output": finished.tail or "(no output recorded)",
                    "stdout": finished.stdout,
                    "stderr": finished.stderr,
                    "exit_code": finished.exit_code,
                    "aggregated": finished.aggregated,
                    "message": f"Session {session_id} finished ({finished.status}).",
                }
            )
        if not session.backgrounded:
            return _error(f"Session {session_id} is not backgrounded.")
        stdout, stderr = drain_pending(session)
        output = "\n".join([chunk for chunk in [stdout, stderr] if chunk]).strip()
        exited = session.exited
        status = "running"
        if exited:
            status = "completed" if (session.exit_code or 0) == 0 else "failed"
        return _success(
            {
                "status": status,
                "session_id": session_id,
                "output": output or "(no new output)",
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": session.exit_code,
                "aggregated": session.aggregated,
                "message": f"Session {session_id} is {status}.",
            }
        )

    if action == "log":
        target = session or finished
        if session and not session.backgrounded:
            return _error(f"Session {session_id} is not backgrounded.")
        offset = args.get("offset")
        limit = args.get("limit")
        sliced = _slice_log_lines(target.aggregated, offset, limit)
        if finished:
            status = finished.status
        elif session and session.exited:
            status = "completed" if (session.exit_code or 0) == 0 else "failed"
        else:
            status = "running"
        return _success(
            {
                "status": status,
                "session_id": session_id,
                "output": sliced["slice"] or "(no output yet)",
                "total_lines": sliced["total_lines"],
                "truncated": target.truncated,
                "message": f"Log slice for session {session_id}.",
            }
        )

    if action == "write":
        if not session:
            return _error(f"No active session found for {session_id}")
        if not session.backgrounded:
            return _error(f"Session {session_id} is not backgrounded.")
        data = (args.get("data") or "").encode("utf-8", errors="replace")
        await _write_to_session(session, data, bool(args.get("eof")))
        return _success(
            {
                "status": "running",
                "session_id": session_id,
                "bytes_written": len(data),
                "output": f"Wrote {len(data)} bytes to session {session_id}.",
                "message": f"Wrote {len(data)} bytes to session {session_id}.",
            }
        )

    if action == "send-keys":
        if not session:
            return _error(f"No active session found for {session_id}")
        if not session.backgrounded:
            return _error(f"Session {session_id} is not backgrounded.")
        payload, warnings = _encode_keys(args.get("keys"), args.get("hex"), args.get("literal"))
        if not payload:
            return _error("No key data provided.")
        await _write_to_session(session, payload, False)
        return _success(
            {
                "status": "running",
                "session_id": session_id,
                "bytes_written": len(payload),
                "warnings": warnings,
                "output": f"Sent {len(payload)} bytes to session {session_id}.",
                "message": f"Sent {len(payload)} bytes to session {session_id}.",
            }
        )

    if action == "submit":
        if not session:
            return _error(f"No active session found for {session_id}")
        if not session.backgrounded:
            return _error(f"Session {session_id} is not backgrounded.")
        await _write_to_session(session, b"\r", False)
        return _success(
            {
                "status": "running",
                "session_id": session_id,
                "output": f"Submitted session {session_id}.",
                "message": f"Submitted session {session_id}.",
            }
        )

    if action == "paste":
        if not session:
            return _error(f"No active session found for {session_id}")
        if not session.backgrounded:
            return _error(f"Session {session_id} is not backgrounded.")
        text = args.get("text") or ""
        payload = _encode_paste(text, bool(args.get("bracketed", True)))
        await _write_to_session(session, payload, False)
        return _success(
            {
                "status": "running",
                "session_id": session_id,
                "bytes_written": len(payload),
                "output": f"Pasted {len(payload)} bytes to session {session_id}.",
                "message": f"Pasted {len(payload)} bytes to session {session_id}.",
            }
        )

    if action == "kill":
        if not session:
            return _error(f"No active session found for {session_id}")
        if session.exited:
            return _success(
                {
                    "status": "completed",
                    "session_id": session_id,
                    "output": f"Session {session_id} already exited.",
                    "message": f"Session {session_id} already exited.",
                }
            )
        await terminate_session_process_tree(session)
        if session.wait_task and not session.wait_task.done():
            try:
                await asyncio.wait_for(session.wait_task, timeout=2.0)
            except asyncio.TimeoutError:
                await cancel_session_tasks(session)
        if not session.exited:
            exit_code = session.process.returncode
            status = "completed" if exit_code == 0 else "failed"
            mark_exited(session, exit_code, status)
        return _success(
            {
                "status": "killed",
                "session_id": session_id,
                "output": f"Killed session {session_id}.",
                "message": f"Killed session {session_id}.",
            }
        )

    if action == "remove":
        if session and not session.exited:
            await terminate_session_process_tree(session)
            await cancel_session_tasks(session)
        if session and session.uses_pty and session.pty_master is not None:
            try:
                os.close(session.pty_master)
            except OSError:
                pass
            session.pty_master = None
        delete_session(session_id)
        return _success(
            {
                "status": "removed",
                "session_id": session_id,
                "output": f"Removed session {session_id}.",
                "message": f"Removed session {session_id}.",
            }
        )

    return _error(f"Unknown action: {action}")
