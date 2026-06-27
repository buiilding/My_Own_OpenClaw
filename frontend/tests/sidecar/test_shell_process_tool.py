"""Covers local-runtime shell process tool behavior."""

import asyncio
import json
import os
import shlex
import sys
from pathlib import Path

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.result import ToolResult  # noqa: E402
from tools.system import shell_process_registry as registry  # noqa: E402
from tools.system import shell_tool  # noqa: E402
from tools.system.process_tool import process_shell_command as _process_shell_command  # noqa: E402
from tools.system.shell_tool import run_shell_command as _run_shell_command  # noqa: E402


async def run_shell_command(args):
    result = await _run_shell_command(args)
    assert isinstance(result, ToolResult)
    return result.to_dict()


async def process_shell_command(args):
    result = await _process_shell_command(args)
    assert isinstance(result, ToolResult)
    return result.to_dict()


def _write_workspace_permission_state(path: Path, workspace: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "permissions": {
                    "filesystem_workspace_access": {
                        "granted": True,
                        "selected_paths": [str(workspace)],
                    }
                },
            }
        ),
        encoding="utf-8",
    )


async def _wait_for_finish(session_id: str, timeout: float = 2.0):
    start = asyncio.get_running_loop().time()
    while True:
        poll = await process_shell_command({"action": "poll", "session_id": session_id})
        if poll["data"]["status"] != "running":
            return poll
        if asyncio.get_running_loop().time() - start > timeout:
            return poll
        await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_run_shell_command_background_poll():
    cmd = f'{sys.executable} -c "import time; print(\'hi\'); time.sleep(0.05)"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": True, "terminate_after_seconds": 5}
    )
    assert result["success"] is True
    session_id = result["data"]["session_id"]

    poll = await process_shell_command({"action": "poll", "session_id": session_id})
    assert poll["success"] is True
    assert poll["data"]["status"] in {"running", "completed", "failed"}
    await _wait_for_finish(session_id)


@pytest.mark.asyncio
async def test_run_shell_command_timeout_sets_flag():
    cmd = f'{sys.executable} -c "import time; time.sleep(0.2)"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 0.05}
    )
    assert result["success"] is True
    assert result["data"]["timed_out"] is True
    assert "timed out" in (result["data"]["error"] or "").lower()


@pytest.mark.asyncio
async def test_run_shell_command_nonzero_exit_preserves_failure_payload():
    cmd = f'{sys.executable} -c "import sys; sys.stderr.write(\'bad\'); sys.exit(7)"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 5}
    )

    assert result["success"] is False
    assert result["error"] == "bad"
    assert result["data"]["error"] == "bad"
    assert isinstance(result["data"]["exit_code"], int)
    assert result["data"]["exit_code"] != 0


@pytest.mark.asyncio
async def test_run_shell_command_timeout_cleans_foreground_session_registry_entry():
    registry.reset_registry_for_tests()
    cmd = f'{sys.executable} -c "import time; time.sleep(0.2)"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 0.05}
    )

    assert result["success"] is True
    assert result["data"]["timed_out"] is True
    assert registry._running_sessions == {}


@pytest.mark.asyncio
async def test_run_shell_command_timeout_kills_child_process_group(tmp_path):
    if sys.platform == "win32":
        pytest.skip("POSIX process groups are not used on Windows")
    marker = tmp_path / "child-survived.txt"
    child_code = (
        "import pathlib,time;"
        "time.sleep(0.25);"
        f"pathlib.Path({str(marker)!r}).write_text('alive', encoding='utf-8')"
    )
    parent_code = (
        "import subprocess,sys,time;"
        f"subprocess.Popen([sys.executable, '-c', {child_code!r}]);"
        "time.sleep(0.6)"
    )
    cmd = f"{sys.executable} -c {shlex.quote(parent_code)}"

    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 0.05}
    )
    await asyncio.sleep(0.35)

    assert result["success"] is True
    assert result["data"]["timed_out"] is True
    assert not marker.exists()


@pytest.mark.asyncio
async def test_run_shell_command_yield_backgrounds():
    cmd = f'{sys.executable} -c "import time; print(\'hi\'); time.sleep(0.1)"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "yield_after_seconds": 0.01}
    )
    assert result["success"] is True
    assert result["data"]["status"] == "running"
    session_id = result["data"]["session_id"]

    await process_shell_command({"action": "kill", "session_id": session_id})


@pytest.mark.asyncio
async def test_run_shell_command_defaults_to_user_home_directory():
    cmd = f'{sys.executable} -c "import os; print(os.getcwd())"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 5}
    )
    assert result["success"] is True
    assert result["data"]["output"].strip() == str(Path.home())


@pytest.mark.asyncio
async def test_run_shell_command_defaults_to_selected_workspace_directory(monkeypatch, tmp_path):
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    cmd = f'{sys.executable} -c "import os; print(os.getcwd())"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 5}
    )

    assert result["success"] is True
    assert result["data"]["output"].strip() == str(workspace_dir)


@pytest.mark.asyncio
async def test_run_shell_command_resolves_dot_directory_from_selected_workspace(monkeypatch, tmp_path):
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    cmd = f'{sys.executable} -c "import os; print(os.getcwd())"'
    result = await run_shell_command(
        {
            "command": cmd,
            "directory": ".",
            "run_in_background": False,
            "terminate_after_seconds": 5,
        }
    )

    assert result["success"] is True
    assert result["data"]["output"].strip() == str(workspace_dir)


@pytest.mark.asyncio
async def test_run_shell_command_resolves_relative_directory_from_selected_workspace(monkeypatch, tmp_path):
    workspace_dir = tmp_path / "workspace"
    child_dir = workspace_dir / "src"
    child_dir.mkdir(parents=True)
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    cmd = f'{sys.executable} -c "import os; print(os.getcwd())"'
    result = await run_shell_command(
        {
            "command": cmd,
            "directory": "src",
            "run_in_background": False,
            "terminate_after_seconds": 5,
        }
    )

    assert result["success"] is True
    assert result["data"]["output"].strip() == str(child_dir)


@pytest.mark.asyncio
async def test_run_shell_command_reports_original_relative_directory_when_missing(monkeypatch, tmp_path):
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    permission_state_path = tmp_path / "permission-state.json"
    _write_workspace_permission_state(permission_state_path, workspace_dir)
    monkeypatch.setenv("WINDIE_PERMISSION_STATE_PATH", str(permission_state_path))

    cmd = f'{sys.executable} -c "import os; print(os.getcwd())"'
    result = await run_shell_command(
        {
            "command": cmd,
            "directory": "missing-dir",
            "run_in_background": False,
            "terminate_after_seconds": 5,
        }
    )

    assert result["success"] is False
    assert result["error"] == "Directory does not exist or is not a directory: missing-dir"


@pytest.mark.asyncio
async def test_run_shell_command_env_override_and_pty_warning():
    cmd = f'{sys.executable} -c "import os; print(os.getenv(\'AGENT_TEST\'))"'
    result = await run_shell_command(
        {
            "command": cmd,
            "run_in_background": False,
            "terminate_after_seconds": 5,
            "env": {"AGENT_TEST": "ok"},
            "pty": True,
        }
    )
    assert result["success"] is True
    assert "ok" in result["data"]["output"]
    warnings = " ".join(result["data"].get("warnings", []))
    try:
        import pty as pty_module  # noqa: F401
        pty_available = True
    except Exception:
        pty_available = False
    if sys.platform == "win32" or not pty_available:
        assert "PTY requested" in warnings
        assert "not supported in this local runtime" in warnings
        assert "not supported in this " + "sidecar" not in warnings


@pytest.mark.asyncio
async def test_run_shell_command_returns_raw_output_without_frontend_truncation():
    cmd = f'{sys.executable} -c "print(\'token \' * 25000)"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 5}
    )

    assert result["success"] is True
    data = result["data"]
    assert "token token token" in data["output"]
    assert "tokens truncated" not in data["output"]
    assert "output_token_limit" not in data


@pytest.mark.asyncio
async def test_run_shell_command_allows_small_multiline_heredoc():
    cmd = "cat <<'EOF'\nsmall\npayload\nEOF"
    result = await run_shell_command({"command": cmd, "run_in_background": False})

    assert result["success"] is True
    assert "small" in result["data"]["output"]
    assert "payload" in result["data"]["output"]


@pytest.mark.asyncio
async def test_run_shell_command_allows_large_multiline_heredoc():
    large_payload = "\n".join(f"line-{index}" for index in range(220))
    cmd = f"cat <<'EOF' | wc -l\n{large_payload}\nEOF"
    result = await run_shell_command({"command": cmd, "run_in_background": False})

    assert result["success"] is True
    assert not result["data"]["error"]
    assert result["data"]["output"].strip() == "220"


def test_rewrite_sudo_command_for_os_prompt_uses_pkexec(monkeypatch):
    monkeypatch.setattr(shell_tool, "IS_LINUX", True)
    monkeypatch.setattr(shell_tool.shutil, "which", lambda _name: "/usr/bin/pkexec")

    rewritten, routed, error = shell_tool._rewrite_sudo_command_for_os_prompt(
        "sudo apt purge -y cursor"
    )

    assert error is None
    assert routed is True
    assert rewritten.startswith("pkexec ")
    assert "bash -lc" in rewritten
    assert "apt purge -y cursor" in rewritten


def test_rewrite_sudo_command_for_os_prompt_rejects_missing_pkexec(monkeypatch):
    monkeypatch.setattr(shell_tool, "IS_LINUX", True)
    monkeypatch.setattr(shell_tool.shutil, "which", lambda _name: None)

    rewritten, routed, error = shell_tool._rewrite_sudo_command_for_os_prompt(
        "sudo apt purge -y cursor"
    )

    assert rewritten == "sudo apt purge -y cursor"
    assert routed is False
    assert "pkexec not found" in (error or "")


def test_normalize_sudo_auth_result_rewrites_canceled_prompt_error():
    result = {
        "output": "",
        "error": "Error executing command as another user: Not authorized",
        "exit_code": 126,
        "execution_time": 0.25,
        "timed_out": False,
    }

    normalized = shell_tool._normalize_sudo_auth_result(result)
    assert normalized["exit_code"] == 126
    assert "canceled or denied" in (normalized["error"] or "").lower()


def test_normalize_sudo_auth_result_rewrites_request_dismissed_error():
    result = {
        "output": "",
        "error": "Error executing command as another user: Request dismissed",
        "exit_code": 1,
        "execution_time": 0.10,
        "timed_out": False,
    }

    normalized = shell_tool._normalize_sudo_auth_result(result)
    assert normalized["exit_code"] == 1
    assert "canceled or denied" in (normalized["error"] or "").lower()


@pytest.mark.asyncio
async def test_process_list_includes_running_session():
    cmd = f'{sys.executable} -c "import time; print(\'hi\'); time.sleep(0.2)"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    session_id = result["data"]["session_id"]

    listing = await process_shell_command({"action": "list"})
    assert listing["success"] is True
    running_ids = {entry["session_id"] for entry in listing["data"]["running"]}
    assert session_id in running_ids

    await process_shell_command({"action": "kill", "session_id": session_id})


@pytest.mark.asyncio
async def test_process_poll_includes_stdout_stderr():
    cmd = f'{sys.executable} -c "import sys; print(\'out\'); print(\'err\', file=sys.stderr)"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    session_id = result["data"]["session_id"]

    poll = await _wait_for_finish(session_id)
    assert poll["success"] is True
    assert "out" in (poll["data"].get("stdout") or "")
    assert "err" in (poll["data"].get("stderr") or "")


@pytest.mark.asyncio
async def test_process_requires_session_id():
    result = await process_shell_command({"action": "poll"})
    assert result["success"] is False
    assert result["error"] == "session_id is required for this action"


@pytest.mark.asyncio
async def test_process_write_roundtrip():
    cmd = f'{sys.executable} -c "import sys; print(sys.stdin.readline().strip())"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    assert result["success"] is True
    session_id = result["data"]["session_id"]

    write = await process_shell_command(
        {"action": "write", "session_id": session_id, "data": "hello\n", "eof": True}
    )
    assert write["success"] is True

    poll = await _wait_for_finish(session_id)

    assert poll is not None
    assert poll["success"] is True
    combined = poll["data"]["output"] + poll["data"].get("aggregated", "")
    assert "hello" in combined


@pytest.mark.asyncio
async def test_process_send_keys_literal():
    cmd = f'{sys.executable} -c "import sys; print(sys.stdin.readline().strip())"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    session_id = result["data"]["session_id"]

    send = await process_shell_command(
        {"action": "send-keys", "session_id": session_id, "literal": "keys\n"}
    )
    assert send["success"] is True

    poll = await _wait_for_finish(session_id)
    combined = poll["data"]["output"] + poll["data"].get("aggregated", "")
    assert "keys" in combined


@pytest.mark.asyncio
async def test_process_send_keys_ignores_non_string_key_tokens():
    cmd = f'{sys.executable} -c "import sys; print(sys.stdin.readline().strip())"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    session_id = result["data"]["session_id"]

    send = await process_shell_command(
        {
            "action": "send-keys",
            "session_id": session_id,
            "keys": [123],
            "literal": "keys\n",
        }
    )
    assert send["success"] is True
    assert "Ignored non-string key token: 123" in (send["data"].get("warnings") or [])

    poll = await _wait_for_finish(session_id)
    combined = poll["data"]["output"] + poll["data"].get("aggregated", "")
    assert "keys" in combined


@pytest.mark.asyncio
async def test_process_log_slices_output():
    cmd = f'{sys.executable} -c "print(\'line1\'); print(\'line2\'); print(\'line3\')"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    session_id = result["data"]["session_id"]

    await _wait_for_finish(session_id)
    log = await process_shell_command(
        {"action": "log", "session_id": session_id, "offset": 1, "limit": 1}
    )
    assert log["success"] is True
    assert log["data"]["output"] == "line2"


@pytest.mark.asyncio
async def test_process_clear_removes_finished():
    cmd = f'{sys.executable} -c "print(\'done\')"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    session_id = result["data"]["session_id"]

    await _wait_for_finish(session_id)
    cleared = await process_shell_command({"action": "clear"})
    assert cleared["success"] is True

    listing = await process_shell_command({"action": "list"})
    assert listing["success"] is True
    finished_ids = {entry["session_id"] for entry in listing["data"]["finished"]}
    assert session_id not in finished_ids


@pytest.mark.asyncio
async def test_process_remove_clears_session():
    cmd = f'{sys.executable} -c "import time; print(\'hi\'); time.sleep(0.2)"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    session_id = result["data"]["session_id"]

    removed = await process_shell_command({"action": "remove", "session_id": session_id})
    assert removed["success"] is True

    poll = await process_shell_command({"action": "poll", "session_id": session_id})
    assert poll["success"] is False
    assert poll["error"] == f"No session found for {session_id}"


@pytest.mark.asyncio
async def test_process_remove_closes_pty_master_fd():
    registry.reset_registry_for_tests()
    cmd = f'{sys.executable} -c "import time; time.sleep(5)"'
    result = await run_shell_command({"command": cmd, "run_in_background": True, "pty": True})
    assert result["success"] is True
    session_id = result["data"]["session_id"]

    session = registry.get_session(session_id)
    if not session or not session.uses_pty or session.pty_master is None:
        await process_shell_command({"action": "remove", "session_id": session_id})
        pytest.skip("PTY not supported in this environment")

    pty_master_fd = session.pty_master
    try:
        removed = await process_shell_command({"action": "remove", "session_id": session_id})
        assert removed["success"] is True
        with pytest.raises(OSError):
            os.fstat(pty_master_fd)
    finally:
        try:
            os.close(pty_master_fd)
        except OSError:
            pass


@pytest.mark.asyncio
async def test_process_log_missing_session():
    result = await process_shell_command({"action": "log", "session_id": "missing"})
    assert result["success"] is False
    assert result["error"] == "No session found for missing"


@pytest.mark.asyncio
async def test_process_kill_missing_session():
    result = await process_shell_command({"action": "kill", "session_id": "missing"})
    assert result["success"] is False
    assert result["error"] == "No session found for missing"


@pytest.mark.asyncio
async def test_process_kill_immediately_removes_session_from_running_registry():
    cmd = f'{sys.executable} -c "import time; time.sleep(5)"'
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    assert result["success"] is True
    session_id = result["data"]["session_id"]

    killed = await process_shell_command({"action": "kill", "session_id": session_id})
    assert killed["success"] is True
    assert killed["data"]["status"] == "killed"

    listing = await process_shell_command({"action": "list"})
    assert listing["success"] is True
    running_ids = {entry["session_id"] for entry in listing["data"]["running"]}
    finished_ids = {entry["session_id"] for entry in listing["data"]["finished"]}
    assert session_id not in running_ids
    assert session_id in finished_ids

    poll = await process_shell_command({"action": "poll", "session_id": session_id})
    assert poll["success"] is True
    assert poll["data"]["status"] in {"completed", "failed"}


@pytest.mark.asyncio
async def test_process_kill_stops_child_process_group(tmp_path):
    if sys.platform == "win32":
        pytest.skip("POSIX process groups are not used on Windows")
    marker = tmp_path / "background-child-survived.txt"
    child_code = (
        "import pathlib,time;"
        "time.sleep(0.3);"
        f"pathlib.Path({str(marker)!r}).write_text('alive', encoding='utf-8')"
    )
    parent_code = (
        "import subprocess,sys,time;"
        f"subprocess.Popen([sys.executable, '-c', {child_code!r}]);"
        "time.sleep(0.8)"
    )
    cmd = f"{sys.executable} -c {shlex.quote(parent_code)}"
    result = await run_shell_command({"command": cmd, "run_in_background": True})
    assert result["success"] is True
    session_id = result["data"]["session_id"]

    killed = await process_shell_command({"action": "kill", "session_id": session_id})
    await asyncio.sleep(0.4)

    assert killed["success"] is True
    assert killed["data"]["status"] == "killed"
    assert not marker.exists()
