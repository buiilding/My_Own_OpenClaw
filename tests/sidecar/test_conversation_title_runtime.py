import asyncio
import logging
from types import SimpleNamespace

import pytest

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from memory import conversation_title_runtime as runtime  # noqa: E402


@pytest.mark.asyncio
async def test_ensure_title_generation_runtime_state_initializes_defaults():
    store = SimpleNamespace(
        title_client=None,
        _title_generation_tasks=None,
        _title_generation_semaphore=None,
    )

    runtime.ensure_title_generation_runtime_state(store=store)

    assert isinstance(store.title_client, runtime.NoopTitleClient)
    assert isinstance(store._title_generation_tasks, dict)
    assert isinstance(store._title_generation_semaphore, asyncio.Semaphore)


@pytest.mark.asyncio
async def test_maybe_generate_conversation_title_dedupes_same_conversation_task(monkeypatch):
    store = SimpleNamespace(
        title_client=runtime.NoopTitleClient(),
        _title_generation_tasks={},
        _title_generation_semaphore=asyncio.Semaphore(2),
    )
    calls = []

    async def _fake_run(**kwargs):
        calls.append(kwargs)
        await asyncio.sleep(0.01)

    monkeypatch.setattr(runtime, "run_conversation_title_generation", _fake_run)

    await runtime.maybe_generate_conversation_title(
        store=store,
        user_id="user-1",
        conversation_id="conv_1",
        preferred_model_id=None,
        preferred_model_provider=None,
        logger=logging.getLogger(__name__),
    )
    await runtime.maybe_generate_conversation_title(
        store=store,
        user_id="user-1",
        conversation_id="conv_1",
        preferred_model_id=None,
        preferred_model_provider=None,
        logger=logging.getLogger(__name__),
    )

    pending = [task for task in store._title_generation_tasks.values() if task and not task.done()]
    if pending:
        await asyncio.gather(*pending)

    assert len(calls) == 1


@pytest.mark.asyncio
async def test_cancel_title_generation_tasks_cancels_and_clears_runtime_state():
    async def _sleeper():
        await asyncio.sleep(10)

    task = asyncio.create_task(_sleeper())
    store = SimpleNamespace(
        title_client=runtime.NoopTitleClient(),
        _title_generation_tasks={("user-1", "conv_1"): task},
        _title_generation_semaphore=asyncio.Semaphore(2),
    )

    await runtime.cancel_title_generation_tasks(store=store)

    assert store._title_generation_tasks == {}
    assert task.done()
