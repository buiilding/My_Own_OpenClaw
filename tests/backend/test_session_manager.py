"""Covers session manager behavior in the backend test suite."""

import asyncio
from typing import Dict
from unittest.mock import AsyncMock

import pytest

from backend.src.agent.session.manager import SessionManager
from backend.src.api.schemas.agent_definition import AgentDefinition
from backend.src.core.config.models import AppConfig
from backend.src.tools.client_manifest import validate_client_tool_manifest


class DummySession:
    def __init__(self, session_id: str = "s-1") -> None:
        self.session_id = session_id
        self.cfg = AppConfig()
        self.updated_configs = []
        self.cleanup_called = False
        self.resolved_tool_calls = {}
        self.pending_tool_results = {}
        self.result_futures = {}
        self.bundle_results = {}
        self.bundle_futures = {}
        self.prompt_builder = AsyncMock()
        self.prompt_builder.system_prompt = "backend-default"
        self.history = AsyncMock()
        self.history.system_prompt = "backend-default"

    async def update_config(self, config: AppConfig) -> None:
        self.cfg = config
        self.updated_configs.append(config)

    async def cleanup(self) -> None:
        self.cleanup_called = True

    def get_resolved_tool_call(self, request_id: str):
        return self.resolved_tool_calls.get(request_id)

    def get_pending_tool_result(self, request_id: str):
        return self.pending_tool_results.get(request_id)

    def get_result_storage(self):
        return self

    def get_result_future(self, request_id: str):
        return self.result_futures.get(request_id)

    def get_bundled_result(self, bundle_id: str):
        return self.bundle_results.get(bundle_id)

    def get_bundle_future(self, bundle_id: str):
        return self.bundle_futures.get(bundle_id)


class FailingCleanupSession(DummySession):
    async def cleanup(self) -> None:
        self.cleanup_called = True
        raise RuntimeError("cleanup failed")


def _assign_active_session(
    manager: SessionManager,
    user_id: str,
    session: DummySession,
    *,
    conversation_ref: str | None = None,
) -> None:
    manager._registry.store_session(
        user_id,
        session,
        conversation_ref=conversation_ref,
    )


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
async def test_get_or_create_session_creates_distinct_sessions_per_conversation() -> (
    None
):
    create_count = 0

    def create_agent_session(user_id: str, config: AppConfig) -> DummySession:
        nonlocal create_count
        create_count += 1
        session = DummySession(session_id=f"session-{create_count}")
        session.cfg = config
        return session

    manager = SessionManager(AppConfig(), create_agent_session)

    session_a = await manager.get_or_create_session("user-1", conversation_ref="conv-a")
    session_b = await manager.get_or_create_session("user-1", conversation_ref="conv-b")
    session_a_again = await manager.get_or_create_session(
        "user-1", conversation_ref="conv-a"
    )

    assert session_a is session_a_again
    assert session_a is not session_b
    assert manager.get_session("user-1", conversation_ref="conv-a") is session_a
    assert manager.get_session("user-1", conversation_ref="conv-b") is session_b
    assert manager.get_session("user-1") is session_b


@pytest.mark.asyncio
async def test_get_session_without_conversation_prefers_latest_named_conversation_over_default() -> (
    None
):
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    default_session = DummySession("default")
    named_session = DummySession("named")
    manager._registry.store_session("user-1", default_session, conversation_ref=None)
    manager._registry.store_session("user-1", named_session, conversation_ref="conv-a")

    assert manager.get_session("user-1") is named_session


@pytest.mark.asyncio
async def test_get_or_create_session_applies_handshake_operating_system(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.PromptManager.render_system_prompt",
        lambda self, operating_system=None, workspace_path=None: (
            f"prompt:{operating_system}:{workspace_path or 'None'}"
        ),
    )

    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    manager.set_client_operating_system("user-1", "Windows")

    session = await manager.get_or_create_session("user-1")

    assert session.prompt_builder.system_prompt == "prompt:Windows:None"
    assert session.history.system_prompt == "prompt:Windows:None"


@pytest.mark.asyncio
async def test_set_client_operating_system_updates_active_session(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.PromptManager.render_system_prompt",
        lambda self, operating_system=None, workspace_path=None: (
            f"prompt:{operating_system}:{workspace_path or 'None'}"
        ),
    )

    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session = DummySession("existing")
    _assign_active_session(manager, "user-1", session)

    manager.set_client_operating_system("user-1", "macOS")

    assert session.prompt_builder.system_prompt == "prompt:macOS:None"
    assert session.history.system_prompt == "prompt:macOS:None"


@pytest.mark.asyncio
async def test_set_session_workspace_path_updates_active_prompt(monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.src.llm.prompts.prompts.PromptManager.render_system_prompt",
        lambda self, operating_system=None, workspace_path=None: (
            f"prompt:{operating_system or 'BackendOS'}:{workspace_path or 'None'}"
        ),
    )

    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    manager.set_client_operating_system("user-1", "Linux")
    session = await manager.get_or_create_session("user-1", conversation_ref="conv-1")

    manager.set_session_workspace_path("user-1", session, "/work/project-alpha")

    assert session.prompt_builder.system_prompt == "prompt:Linux:/work/project-alpha"
    assert session.prompt_builder.workspace_path == "/work/project-alpha"
    assert session.history.system_prompt == "prompt:Linux:/work/project-alpha"


@pytest.mark.asyncio
async def test_agent_definition_updates_prompt_layers_and_custom_system_prompt() -> (
    None
):
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session = DummySession("existing")
    _assign_active_session(manager, "user-1", session)

    definition = AgentDefinition(
        system_prompt={"mode": "replace", "content": "Custom agent prompt."},
        runtime={"workspace_path": "/work/project", "operating_system": "macOS"},
        agents_md=[
            {
                "id": "repo",
                "type": "agents_md",
                "priority": 50,
                "content": "Follow repo rules.",
            }
        ],
        skills=[
            {
                "id": "review",
                "type": "extension_skill",
                "priority": 70,
                "content": "Review before answering.",
                "revision": "rev-1",
            },
            {
                "id": "review",
                "type": "extension_skill",
                "priority": 70,
                "content": "Review before answering.",
                "revision": "rev-1",
            },
        ],
    )

    manager.set_agent_definition("user-1", definition)

    assert session.prompt_builder.system_prompt == (
        "Provided operating system: macOS\n"
        "Provided workspace: /work/project\n\n"
        "Custom agent prompt."
    )
    assert session.history.system_prompt == session.prompt_builder.system_prompt
    assert session.prompt_builder.workspace_path == "/work/project"
    assert session.prompt_builder.client_prompt_layers == [
        {
            "id": "repo",
            "type": "agents_md",
            "priority": 50,
            "content": "Follow repo rules.",
        },
        {
            "id": "review",
            "type": "extension_skill",
            "priority": 70,
            "content": "Review before answering.",
            "revision": "rev-1",
        },
    ]


@pytest.mark.asyncio
async def test_partial_agent_definition_does_not_clear_existing_client_tools() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session = DummySession("existing")
    _assign_active_session(manager, "user-1", session)

    manager.set_agent_definition(
        "user-1",
        AgentDefinition(
            tools={
                "client_manifest": {
                    "version": 1,
                    "tools": [
                        {
                            "name": "save_note",
                            "description": "Save a note",
                            "execution_target": "local_runtime",
                            "schema": {
                                "type": "object",
                                "properties": {"text": {"type": "string"}},
                                "required": ["text"],
                            },
                        }
                    ],
                },
            }
        ),
    )

    manager.set_agent_definition(
        "user-1",
        AgentDefinition(
            system_prompt={"mode": "replace", "content": "Prompt with repo rules."},
            agents_md=[
                {
                    "id": "repo",
                    "type": "agents_md",
                    "priority": 50,
                    "content": "Follow repo rules.",
                }
            ],
        ),
    )

    assert [
        schema.get("name") for schema in session.prompt_builder.client_tool_schemas
    ] == ["save_note"]
    assert session.prompt_builder.client_prompt_layers == [
        {
            "id": "repo",
            "type": "agents_md",
            "priority": 50,
            "content": "Follow repo rules.",
        }
    ]


@pytest.mark.asyncio
async def test_set_client_tool_manifest_applies_to_active_and_future_sessions() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    active = DummySession("active")
    _assign_active_session(manager, "user-1", active, conversation_ref="conv-a")
    manifest_result = validate_client_tool_manifest(
        {
            "version": 1,
            "tools": [
                {
                    "name": "cua_driver__screenshot",
                    "description": "Capture the screen through CUA.",
                    "execution_target": "local_runtime",
                    "argument_resolution": "passthrough",
                    "schema": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                }
            ],
        }
    )

    manager.set_client_tool_manifest("user-1", manifest_result)
    future = await manager.get_or_create_session(
        "user-1",
        conversation_ref="conv-b",
    )

    assert [
        schema.get("name") for schema in active.prompt_builder.client_tool_schemas
    ] == ["cua_driver__screenshot"]
    assert active.cfg.agent_available_tools == ["cua_driver__screenshot"]
    assert [
        schema.get("name") for schema in future.prompt_builder.client_tool_schemas
    ] == ["cua_driver__screenshot"]
    assert future.cfg.agent_available_tools == ["cua_driver__screenshot"]


@pytest.mark.asyncio
async def test_update_all_sessions_config_updates_active_sessions() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    first = DummySession("first")
    second = DummySession("second")
    _assign_active_session(manager, "user-1", first)
    _assign_active_session(manager, "user-2", second)

    new_config = AppConfig(model_provider="anthropic")
    await manager.update_all_sessions_config(new_config)

    assert first.updated_configs
    assert first.updated_configs[-1].model_provider == "anthropic"
    assert second.updated_configs
    assert second.updated_configs[-1].model_provider == "anthropic"


@pytest.mark.asyncio
async def test_update_all_sessions_config_does_not_mutate_container() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    _assign_active_session(manager, "user-1", DummySession("s-1"))

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
    _assign_active_session(manager, "user-1", session)
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
async def test_update_session_config_applies_to_future_conversation_sessions() -> None:
    create_count = 0

    def create_agent_session(user_id: str, config: AppConfig) -> DummySession:
        nonlocal create_count
        create_count += 1
        session = DummySession(session_id=f"session-{create_count}")
        session.cfg = config
        return session

    manager = SessionManager(AppConfig(), create_agent_session)

    await manager.update_session_config("user-1", {"model_provider": "anthropic"})
    session = await manager.get_or_create_session("user-1", conversation_ref="conv-a")

    assert session.cfg.model_provider == "anthropic"


@pytest.mark.asyncio
async def test_update_session_config_stores_user_agent_policy_override() -> None:
    def create_agent_session(user_id: str, config: AppConfig) -> DummySession:
        session = DummySession()
        session.cfg = config
        return session

    manager = SessionManager(AppConfig(), create_agent_session)

    await manager.update_session_config(
        "user-1",
        {
            "agent_tool_profile": "coding",
            "agent_coordinate_methods": ["manual"],
            "agent_disabled_capabilities": ["ocr", "vision"],
        },
    )
    session = await manager.get_or_create_session("user-1", conversation_ref="conv-a")

    assert session.cfg.agent_tool_profile == "coding"
    assert session.cfg.agent_coordinate_methods == ["manual"]
    assert session.cfg.agent_disabled_capabilities == ["ocr", "vision"]


@pytest.mark.asyncio
async def test_get_or_create_session_applies_provider_health_policy() -> None:
    def create_agent_session(user_id: str, config: AppConfig) -> DummySession:
        session = DummySession()
        session.cfg = config
        return session

    manager = SessionManager(
        AppConfig(),
        create_agent_session,
        provider_health_resolver=lambda cfg: ["ocr", "vision"],
    )

    session = await manager.get_or_create_session("user-1")

    assert session.cfg.agent_provider_unavailable_capabilities == ["ocr", "vision"]


@pytest.mark.asyncio
async def test_end_session_removes_session_and_lock() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session = await manager.get_or_create_session("user-1")
    assert "user-1" in manager._registry.user_locks

    await manager.end_session("user-1")

    assert session.cleanup_called is True
    assert "user-1" not in manager._registry.active_sessions
    assert "user-1" not in manager._registry.user_locks


@pytest.mark.asyncio
async def test_end_session_still_removes_session_when_cleanup_fails() -> None:
    manager = SessionManager(
        AppConfig(), lambda user_id, config: FailingCleanupSession()
    )
    session = await manager.get_or_create_session("user-1")

    await manager.end_session("user-1")

    assert session.cleanup_called is True
    assert "user-1" not in manager._registry.active_sessions
    assert "user-1" not in manager._registry.user_locks


@pytest.mark.asyncio
async def test_end_session_missing_user_is_noop() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    await manager.end_session("missing-user")

    assert manager._registry.active_sessions == {}


@pytest.mark.asyncio
async def test_end_session_can_remove_one_conversation_without_clearing_others() -> (
    None
):
    first = DummySession("first")
    second = DummySession("second")
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    manager._registry.store_session("user-1", first, conversation_ref="conv-a")
    manager._registry.store_session("user-1", second, conversation_ref="conv-b")

    await manager.end_session("user-1", conversation_ref="conv-a")

    assert first.cleanup_called is True
    assert second.cleanup_called is False
    assert manager.get_session("user-1", conversation_ref="conv-a") is None
    assert manager.get_session("user-1", conversation_ref="conv-b") is second
    assert "user-1" in manager._registry.active_sessions


@pytest.mark.asyncio
async def test_update_all_sessions_config_continues_after_one_failure() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    good = DummySession("good")
    bad = DummySession("bad")
    bad.update_config = AsyncMock(side_effect=RuntimeError("boom"))
    good.update_config = AsyncMock()

    _assign_active_session(manager, "good-user", good)
    _assign_active_session(manager, "bad-user", bad)

    await manager.update_all_sessions_config(AppConfig(model_provider="anthropic"))

    good.update_config.assert_called_once()
    bad.update_config.assert_called_once()


def test_get_session_for_request_id_resolves_matching_conversation_session() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session_a = DummySession("session-a")
    session_b = DummySession("session-b")
    session_b.result_futures["req-123"] = object()
    manager._registry.store_session("user-1", session_a, conversation_ref="conv-a")
    manager._registry.store_session("user-1", session_b, conversation_ref="conv-b")

    assert manager.get_session_for_request_id("user-1", "req-123") is session_b
    assert manager.get_session_for_request_id("user-1", "missing") is None


def test_get_session_for_bundle_id_resolves_matching_conversation_session() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    session_a = DummySession("session-a")
    session_b = DummySession("session-b")
    session_a.bundle_futures["bundle-123"] = object()
    manager._registry.store_session("user-1", session_a, conversation_ref="conv-a")
    manager._registry.store_session("user-1", session_b, conversation_ref="conv-b")

    assert manager.get_session_for_bundle_id("user-1", "bundle-123") is session_a
    assert manager.get_session_for_bundle_id("user-1", "missing") is None


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
        assert "user-1" not in manager._active_queries.active_query_tasks
    finally:
        await asyncio.gather(first_task, second_task, return_exceptions=True)


@pytest.mark.asyncio
async def test_cancel_active_query_task_sets_pending_stop_and_consumes_late_registration() -> (
    None
):
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    async def _sleep_forever() -> None:
        await asyncio.sleep(3600)

    cancelled = manager.cancel_active_query_task("user-1")
    assert cancelled is None
    assert manager._active_queries.pending_stop_requests["user-1"][(None, None)] > 0

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
        assert "user-1" not in manager._active_queries.active_query_tasks
        assert "user-1" not in manager._active_queries.pending_stop_requests
    finally:
        if not late_query_task.done():
            late_query_task.cancel()
        await asyncio.gather(late_query_task, return_exceptions=True)


@pytest.mark.asyncio
async def test_register_active_query_task_ignores_expired_pending_stop_request() -> (
    None
):
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())
    manager._active_queries.pending_stop_requests["user-1"] = {(None, None): 0.0}

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
        assert "user-1" not in manager._active_queries.pending_stop_requests
    finally:
        manager.clear_active_query_task("user-1", active_task)
        active_task.cancel()
        await asyncio.gather(active_task, return_exceptions=True)


@pytest.mark.asyncio
async def test_cancel_active_query_task_scopes_cancellation_by_conversation_ref() -> (
    None
):
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    async def _sleep_forever() -> None:
        await asyncio.sleep(3600)

    task_a = asyncio.create_task(_sleep_forever())
    task_b = asyncio.create_task(_sleep_forever())
    try:
        manager.register_active_query_task(
            "user-1",
            task_a,
            turn_ref="turn-a",
            conversation_ref="conv-a",
        )
        manager.register_active_query_task(
            "user-1",
            task_b,
            turn_ref="turn-b",
            conversation_ref="conv-b",
        )

        cancelled = manager.cancel_active_query_task(
            "user-1", conversation_ref="conv-a"
        )
        await asyncio.sleep(0)

        assert cancelled == ("turn-a", "conv-a")
        assert task_a.cancelled() is True
        assert task_b.cancelled() is False
        assert manager.has_active_query_task("user-1") is True
    finally:
        manager.clear_active_query_task("user-1", task_b)
        task_b.cancel()
        await asyncio.gather(task_a, task_b, return_exceptions=True)


@pytest.mark.asyncio
async def test_cancel_active_query_task_scopes_cancellation_by_turn_ref() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    async def _sleep_forever() -> None:
        await asyncio.sleep(3600)

    task_a = asyncio.create_task(_sleep_forever())
    task_b = asyncio.create_task(_sleep_forever())
    try:
        manager.register_active_query_task(
            "user-1",
            task_a,
            turn_ref="turn-a",
            conversation_ref="conv-a",
        )
        manager.register_active_query_task(
            "user-1",
            task_b,
            turn_ref="turn-b",
            conversation_ref="conv-a",
        )

        cancelled = manager.cancel_active_query_task(
            "user-1",
            conversation_ref="conv-a",
            turn_ref="turn-a",
        )
        await asyncio.sleep(0)

        assert cancelled == ("turn-a", "conv-a")
        assert task_a.cancelled() is True
        assert task_b.cancelled() is False
        assert manager.has_active_query_task("user-1") is True
    finally:
        manager.clear_active_query_task("user-1", task_b)
        task_b.cancel()
        await asyncio.gather(task_a, task_b, return_exceptions=True)


@pytest.mark.asyncio
async def test_pending_stop_request_is_scoped_to_matching_conversation_ref() -> None:
    manager = SessionManager(AppConfig(), lambda user_id, config: DummySession())

    async def _sleep_forever() -> None:
        await asyncio.sleep(3600)

    cancelled = manager.cancel_active_query_task("user-1", conversation_ref="conv-a")
    assert cancelled is None
    assert manager._active_queries.pending_stop_requests["user-1"][("conv-a", None)] > 0

    query_conv_b = asyncio.create_task(_sleep_forever())
    query_conv_a = asyncio.create_task(_sleep_forever())
    try:
        consumed_for_b = manager.register_active_query_task(
            "user-1",
            query_conv_b,
            turn_ref="turn-b",
            conversation_ref="conv-b",
        )
        consumed_for_a = manager.register_active_query_task(
            "user-1",
            query_conv_a,
            turn_ref="turn-a",
            conversation_ref="conv-a",
        )

        assert consumed_for_b is False
        assert consumed_for_a is True
        assert manager.has_active_query_task("user-1") is True
    finally:
        manager.clear_active_query_task("user-1", query_conv_b)
        query_conv_b.cancel()
        if not query_conv_a.done():
            query_conv_a.cancel()
        await asyncio.gather(query_conv_b, query_conv_a, return_exceptions=True)
