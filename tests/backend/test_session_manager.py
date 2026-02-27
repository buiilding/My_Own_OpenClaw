import asyncio
from typing import Dict
from unittest.mock import AsyncMock

import pytest

from backend.src.agent.session.manager import SessionManager
from backend.src.core.config.models import AppConfig


class DummySession:
    def __init__(self, session_id: str = "s-1") -> None:
        self.session_id = session_id
        self.cfg = AppConfig()
        self.updated_configs = []
        self.cleanup_called = False

    async def update_config(self, config: AppConfig) -> None:
        self.cfg = config
        self.updated_configs.append(config)

    async def cleanup(self) -> None:
        self.cleanup_called = True


class FailingCleanupSession(DummySession):
    async def cleanup(self) -> None:
        self.cleanup_called = True
        raise RuntimeError("cleanup failed")


@pytest.mark.asyncio
async def test_get_or_create_session_is_race_safe() -> None:
    create_count = 0
    created_sessions: Dict[str, DummySession] = {}

    def create_agent_session(user_id: str, config: AppConfig) -> DummySession:
        nonlocal create_count
        create_count += 1
        session = DummySession(session_id=f"session-{create_count}")
        session.cfg = config
        created_sessions[user_id] = session
        return session

    manager = SessionManager(AppConfig(), create_agent_session)

    tasks = [manager.get_or_create_session("user-1") for _ in range(20)]
    results = await asyncio.gather(*tasks)

    assert create_count == 1
    assert len({id(session) for session in results}) == 1
    assert results[0] is created_sessions["user-1"]


@pytest.mark.asyncio
async def test_update_all_sessions_config_updates_active_sessions() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    first = DummySession("first")
    second = DummySession("second")
    manager.active_sessions["user-1"] = first
    manager.active_sessions["user-2"] = second

    new_config = AppConfig(model_provider="anthropic")
    await manager.update_all_sessions_config(new_config)

    assert first.updated_configs
    assert first.updated_configs[-1].model_provider == "anthropic"
    assert second.updated_configs
    assert second.updated_configs[-1].model_provider == "anthropic"


@pytest.mark.asyncio
async def test_update_all_sessions_config_does_not_mutate_container() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    manager.active_sessions["user-1"] = DummySession("s-1")

    # Legacy attribute may still appear dynamically; manager should ignore it.
    manager.container = AsyncMock()

    await manager.update_all_sessions_config(AppConfig(model_provider="gemini"))

    manager.container.update_config.assert_not_called()


@pytest.mark.asyncio
async def test_get_user_lock_reuses_per_user_lock() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    lock_a1 = await manager._get_user_lock("user-a")
    lock_a2 = await manager._get_user_lock("user-a")
    lock_b = await manager._get_user_lock("user-b")

    assert lock_a1 is lock_a2
    assert lock_a1 is not lock_b


@pytest.mark.asyncio
async def test_get_session_returns_active_or_none() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    assert manager.get_session("missing") is None

    session = DummySession("existing")
    manager.active_sessions["user-1"] = session
    assert manager.get_session("user-1") is session


@pytest.mark.asyncio
async def test_update_session_config_no_updates_is_noop() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session = await manager.get_or_create_session("user-1")
    session.update_config = AsyncMock()

    await manager.update_session_config("user-1", {})
    await manager.update_session_config("user-1", {"speech_mode_enabled": None})

    session.update_config.assert_not_called()


@pytest.mark.asyncio
async def test_update_session_config_applies_non_none_changes(monkeypatch) -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    monkeypatch.setattr(
        SessionManager,
        "_assemble_runtime_session_config",
        staticmethod(lambda cfg: cfg),
    )
    session = await manager.get_or_create_session("user-1")
    session.update_config = AsyncMock()
    original_model_provider = session.cfg.model_provider

    await manager.update_session_config(
        "user-1",
        {
            "model_provider": "anthropic",
            "speech_mode_enabled": None,
        },
    )

    session.update_config.assert_called_once()
    updated_cfg = session.update_config.call_args.args[0]
    assert updated_cfg.model_provider == "anthropic"
    assert updated_cfg.model_provider != original_model_provider


@pytest.mark.asyncio
async def test_end_session_removes_session_and_lock() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session = await manager.get_or_create_session("user-1")
    assert "user-1" in manager._user_locks

    await manager.end_session("user-1")

    assert session.cleanup_called is True
    assert "user-1" not in manager.active_sessions
    assert "user-1" not in manager._user_locks


@pytest.mark.asyncio
async def test_end_session_still_removes_session_when_cleanup_fails() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: FailingCleanupSession())
    session = await manager.get_or_create_session("user-1")

    await manager.end_session("user-1")

    assert session.cleanup_called is True
    assert "user-1" not in manager.active_sessions
    assert "user-1" not in manager._user_locks


@pytest.mark.asyncio
async def test_end_session_missing_user_is_noop() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    await manager.end_session("missing-user")

    assert manager.active_sessions == {}


@pytest.mark.asyncio
async def test_update_all_sessions_config_continues_after_one_failure() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    good = DummySession("good")
    bad = DummySession("bad")
    bad.update_config = AsyncMock(side_effect=RuntimeError("boom"))
    good.update_config = AsyncMock()

    manager.active_sessions["good-user"] = good
    manager.active_sessions["bad-user"] = bad

    await manager.update_all_sessions_config(AppConfig(model_provider="anthropic"))

    good.update_config.assert_called_once()
    bad.update_config.assert_called_once()


@pytest.mark.asyncio
async def test_on_config_changed_forwards_new_config() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    manager.update_all_sessions_config = AsyncMock()
    old_cfg = AppConfig(model_provider="openai")
    new_cfg = AppConfig(model_provider="anthropic")

    await manager.on_config_changed(old_cfg, new_cfg)

    manager.update_all_sessions_config.assert_called_once_with(new_cfg)


@pytest.mark.asyncio
async def test_cancel_active_query_task_cancels_all_registered_tasks() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    async def _sleep_forever() -> None:
        await asyncio.sleep(3600)

    first_task = asyncio.create_task(_sleep_forever())
    second_task = asyncio.create_task(_sleep_forever())

    try:
        manager.register_active_query_task(
            "user-1",
            first_task,
            turn_ref="turn-1",
            conversation_ref="conv-1",
        )
        manager.register_active_query_task(
            "user-1",
            second_task,
            turn_ref="turn-2",
            conversation_ref="conv-2",
        )

        cancelled = manager.cancel_active_query_task("user-1")
        await asyncio.sleep(0)

        assert cancelled == ("turn-2", "conv-2")
        assert first_task.cancelled() is True
        assert second_task.cancelled() is True
        assert "user-1" not in manager._active_query_tasks
    finally:
        await asyncio.gather(first_task, second_task, return_exceptions=True)


@pytest.mark.asyncio
async def test_cancel_active_query_task_sets_pending_stop_and_consumes_late_registration() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    async def _sleep_forever() -> None:
        await asyncio.sleep(3600)

    cancelled = manager.cancel_active_query_task("user-1")
    assert cancelled is None
    assert "user-1" in manager._pending_stop_requests

    late_query_task = asyncio.create_task(_sleep_forever())
    try:
        consumed_stop = manager.register_active_query_task(
            "user-1",
            late_query_task,
            turn_ref="turn-late",
            conversation_ref="conv-late",
        )
        await asyncio.sleep(0)

        assert consumed_stop is True
        assert late_query_task.cancelled() is False
        assert "user-1" not in manager._active_query_tasks
        assert "user-1" not in manager._pending_stop_requests
    finally:
        if not late_query_task.done():
            late_query_task.cancel()
        await asyncio.gather(late_query_task, return_exceptions=True)


@pytest.mark.asyncio
async def test_register_active_query_task_ignores_expired_pending_stop_request() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    manager._pending_stop_requests["user-1"] = 0.0

    async def _sleep_forever() -> None:
        await asyncio.sleep(3600)

    active_task = asyncio.create_task(_sleep_forever())
    try:
        consumed_stop = manager.register_active_query_task(
            "user-1",
            active_task,
            turn_ref="turn-active",
            conversation_ref="conv-active",
        )

        assert consumed_stop is False
        assert manager.has_active_query_task("user-1") is True
        assert "user-1" not in manager._pending_stop_requests
    finally:
        manager.clear_active_query_task("user-1", active_task)
        active_task.cancel()
        await asyncio.gather(active_task, return_exceptions=True)
