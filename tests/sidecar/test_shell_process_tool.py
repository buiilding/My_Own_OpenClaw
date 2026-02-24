import os
import sys
from pathlib import Path

import asyncio
import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.system.shell_tool import run_shell_command  # noqa: E402
from tools.system.process_tool import process_shell_command  # noqa: E402
from tools.system import shell_process_registry as registry  # noqa: E402


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
async def test_run_shell_command_env_override_and_pty_warning():
    cmd = f'{sys.executable} -c "import os; print(os.getenv(\'WINDIE_TEST\'))"'
    result = await run_shell_command(
        {
            "command": cmd,
            "run_in_background": False,
            "terminate_after_seconds": 5,
            "env": {"WINDIE_TEST": "ok"},
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


@pytest.mark.asyncio
async def test_run_shell_command_applies_default_output_token_truncation():
    cmd = f'{sys.executable} -c "print(\'token \' * 25000)"'
    result = await run_shell_command(
        {"command": cmd, "run_in_background": False, "terminate_after_seconds": 5}
    )

    assert result["success"] is True
    data = result["data"]
    assert data["output_token_limit"] == 10000
    assert data["output_truncated"] is True
    assert data["original_output_tokens"] > 10000
    assert "tokens truncated" in data["llm_content"]
    assert "Original output token count" in data["llm_content"]


@pytest.mark.asyncio
async def test_run_shell_command_respects_custom_output_token_limit():
    cmd = f'{sys.executable} -c "print(\'token \' * 500)"'
    result = await run_shell_command(
        {
            "command": cmd,
            "run_in_background": False,
            "terminate_after_seconds": 5,
            "max_output_tokens": 6,
        }
    )

    assert result["success"] is True
    data = result["data"]
    assert data["output_token_limit"] == 6
    assert data["output_truncated"] is True
    assert data["original_output_tokens"] > 6
    assert "tokens truncated" in data["llm_content"]


@pytest.mark.asyncio
async def test_run_shell_command_rejects_invalid_max_output_tokens():
    cmd = f'{sys.executable} -c "print(\'ok\')"'
    result = await run_shell_command(
        {
            "command": cmd,
            "run_in_background": False,
            "terminate_after_seconds": 5,
            "max_output_tokens": "bad",
        }
    )

    assert result["success"] is False
    assert "max_output_tokens must be an integer" in result["error"]


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
