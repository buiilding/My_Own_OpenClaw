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
