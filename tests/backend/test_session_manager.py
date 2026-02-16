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
