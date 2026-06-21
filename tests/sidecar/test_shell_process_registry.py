"""Covers local-runtime shell process registry behavior."""

import asyncio
import os

import pytest
from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from tools.system import shell_process_registry as registry  # noqa: E402


class DummyProcess:
    def __init__(self, pid: int = 1234):
        self.pid = pid
        self.returncode = None
        self.kill_calls = 0
        self.wait_calls = 0

    def kill(self) -> None:
        self.kill_calls += 1
        self.returncode = -9

    async def wait(self) -> int:
        self.wait_calls += 1
        if self.returncode is None:
            self.returncode = 0
        return self.returncode


@pytest.fixture(autouse=True)
def _reset_registry_state():
    registry.reset_registry_for_tests()
    yield
    registry.reset_registry_for_tests()


def _make_session(
    session_id: str,
    *,
    backgrounded: bool = True,
    uses_pty: bool = False,
    process: DummyProcess | None = None,
) -> registry.ProcessSession:
    return registry.ProcessSession(
        id=session_id,
        command="echo test",
        cwd="/tmp",
        process=process or DummyProcess(),
        started_at=1000.0,
        backgrounded=backgrounded,
        uses_pty=uses_pty,
    )


def test_create_session_id_returns_unique_hex_tokens():
    first = registry.create_session_id()
    second = registry.create_session_id()

    assert len(first) == 32
    assert len(second) == 32
    assert first != second
    int(first, 16)
    int(second, 16)


def test_clamp_and_read_env_int(monkeypatch):
    assert registry._clamp(None, 1, 10, 7) == 7
    assert registry._clamp(-2, 1, 10, 7) == 1
    assert registry._clamp(12, 1, 10, 7) == 10

    monkeypatch.delenv("AGENT_TEST_INT", raising=False)
    assert registry._read_env_int("AGENT_TEST_INT") is None

    monkeypatch.setenv("AGENT_TEST_INT", "abc")
    assert registry._read_env_int("AGENT_TEST_INT") is None

    monkeypatch.setenv("AGENT_TEST_INT", "42")
    assert registry._read_env_int("AGENT_TEST_INT") == 42


def test_resolve_job_ttl_prefers_agent_env(monkeypatch):
    monkeypatch.setenv(registry.ENV_WINDIE_SHELL_JOB_TTL_SECONDS, "900")
    monkeypatch.setenv(registry.ENV_AGENT_SHELL_JOB_TTL_SECONDS, "120")

    assert registry.resolve_job_ttl_seconds() == 120


def test_resolve_job_ttl_supports_windie_legacy_env(monkeypatch):
    monkeypatch.delenv(registry.ENV_AGENT_SHELL_JOB_TTL_SECONDS, raising=False)
    monkeypatch.setenv(registry.ENV_WINDIE_SHELL_JOB_TTL_SECONDS, "900")

    assert registry.resolve_job_ttl_seconds() == 900


def test_resolve_job_ttl_clamps_agent_env(monkeypatch):
    monkeypatch.setenv(registry.ENV_AGENT_SHELL_JOB_TTL_SECONDS, "1")

    assert registry.resolve_job_ttl_seconds() == registry.MIN_JOB_TTL_SECONDS


def test_list_running_sessions_only_returns_backgrounded_entries():
    backgrounded = _make_session("bg", backgrounded=True)
    foreground = _make_session("fg", backgrounded=False)

    registry.add_session(backgrounded)
    registry.add_session(foreground)

    running_ids = {session.id for session in registry.list_running_sessions()}
    assert running_ids == {"bg"}


def test_append_output_caps_pending_and_total_aggregation():
    session = _make_session("s1")
    session.max_output_chars = 10
    session.pending_max_output_chars = 6

    registry.append_output(session, "stdout", "abc")
    registry.append_output(session, "stdout", "defghij")
    registry.append_output(session, "stdout", "klm")

    assert session.total_output_chars == len("abcdefghijklm")
    assert session.pending_stdout_chars == 6
    assert "".join(session.pending_stdout) == "hijklm"
    assert session.aggregated == "defghijklm"
    assert session.stdout_aggregated == "defghijklm"
    assert session.tail == "defghijklm"
    assert session.stdout_tail == "defghijklm"
    assert session.truncated is True


def test_drain_pending_returns_chunks_and_resets_counters():
    session = _make_session("s2")

    registry.append_output(session, "stdout", "out")
    registry.append_output(session, "stderr", "err")

    stdout, stderr = registry.drain_pending(session)

    assert stdout == "out"
    assert stderr == "err"
    assert session.pending_stdout == []
    assert session.pending_stderr == []
    assert session.pending_stdout_chars == 0
    assert session.pending_stderr_chars == 0


def test_mark_exited_backgrounded_moves_to_finished():
    session = _make_session("s3", backgrounded=True)
    registry.add_session(session)

    registry.append_output(session, "stdout", "ok")
    registry.append_output(session, "stderr", "warn")
    registry.mark_exited(session, 1, "failed")

    assert registry.get_session("s3") is None
    finished = registry.get_finished_session("s3")
    assert finished is not None
    assert finished.status == "failed"
    assert finished.exit_code == 1
    assert finished.stdout == "ok"
    assert finished.stderr == "warn"
    assert finished.aggregated == "okwarn"
    assert finished.total_output_chars == len("okwarn")


def test_mark_exited_foreground_session_is_not_kept_as_finished():
    session = _make_session("s4", backgrounded=False)
    registry.add_session(session)

    registry.mark_exited(session, 0, "completed")

    assert registry.get_session("s4") is None
    assert registry.get_finished_session("s4") is None


def test_prune_finished_respects_ttl(monkeypatch):
    registry._finished_sessions["old"] = registry.FinishedSession(
        id="old",
        command="old-cmd",
        cwd="/tmp",
        started_at=10.0,
        ended_at=30.0,
        status="completed",
        exit_code=0,
        aggregated="",
        tail="",
        stdout="",
        stderr="",
        stdout_tail="",
        stderr_tail="",
        truncated=False,
        total_output_chars=0,
    )
    registry._finished_sessions["new"] = registry.FinishedSession(
        id="new",
        command="new-cmd",
        cwd="/tmp",
        started_at=90.0,
        ended_at=95.0,
        status="completed",
        exit_code=0,
        aggregated="",
        tail="",
        stdout="",
        stderr="",
        stdout_tail="",
        stderr_tail="",
        truncated=False,
        total_output_chars=0,
    )

    monkeypatch.setattr(registry, "job_ttl_seconds", 50)
    monkeypatch.setattr(registry.time, "time", lambda: 100.0)

    registry._prune_finished()

    assert "old" not in registry._finished_sessions
    assert "new" in registry._finished_sessions


@pytest.mark.asyncio
async def test_reset_registry_for_tests_cancels_sweeper_task():
    task = asyncio.create_task(asyncio.sleep(60))
    registry._sweeper_task = task

    registry.reset_registry_for_tests()
    await asyncio.sleep(0)

    assert registry._sweeper_task is None
    assert task.cancelled() is True


@pytest.mark.asyncio
async def test_shutdown_registry_for_tests_cancels_tasks_and_closes_pty():
    process = DummyProcess()
    wait_task = asyncio.create_task(asyncio.sleep(60))
    read_task = asyncio.create_task(asyncio.sleep(60))
    read_fd, write_fd = os.pipe()

    session = _make_session("s5", uses_pty=True, process=process)
    session.loop = None  # force non-current loop branch
    session.wait_task = wait_task
    session.read_tasks = [read_task]
    session.pty_master = read_fd

    registry._running_sessions[session.id] = session
    registry._finished_sessions["done"] = registry.FinishedSession(
        id="done",
        command="cmd",
        cwd="/tmp",
        started_at=0.0,
        ended_at=1.0,
        status="completed",
        exit_code=0,
        aggregated="",
        tail="",
        stdout="",
        stderr="",
        stdout_tail="",
        stderr_tail="",
        truncated=False,
        total_output_chars=0,
    )

    await registry.shutdown_registry_for_tests()
    await asyncio.sleep(0)

    os.close(write_fd)

    assert process.kill_calls == 1
    assert wait_task.cancelled() is True
    assert read_task.cancelled() is True
    assert session.pty_master is None
    assert registry._running_sessions == {}
    assert registry._finished_sessions == {}
