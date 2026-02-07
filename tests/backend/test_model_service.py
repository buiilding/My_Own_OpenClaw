import asyncio

import pytest

from backend.src.core.config.models import AppConfig
from backend.src.llm.models.model_service import ModelService


class FakeLocalProvider:
    def __init__(
        self,
        provider_name: str,
        state: dict,
        should_fail: bool = False,
        delay_seconds: float = 0.02,
    ) -> None:
        self.provider_name = provider_name
        self.state = state
        self.should_fail = should_fail
        self.delay_seconds = delay_seconds

    async def list_models(self):
        lock = self.state["lock"]
        async with lock:
            self.state["active_calls"] += 1
            self.state["max_active_calls"] = max(
                self.state["max_active_calls"],
                self.state["active_calls"],
            )

        await asyncio.sleep(self.delay_seconds)

        async with lock:
            self.state["active_calls"] -= 1

        if self.should_fail:
            raise RuntimeError(f"{self.provider_name} unavailable")

        return [
            {
                "id": f"{self.provider_name}-model",
                "provider": self.provider_name,
                "display_name": f"{self.provider_name}/{self.provider_name}-model",
            }
        ]


@pytest.mark.asyncio
async def test_get_local_models_fetches_local_providers_in_parallel(monkeypatch):
    state = {
        "active_calls": 0,
        "max_active_calls": 0,
        "lock": asyncio.Lock(),
    }
    factory = {
        "ollama": FakeLocalProvider("ollama", state),
        "lmstudio": FakeLocalProvider("lmstudio", state),
    }
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert len(models) == 2
    assert {model["provider"] for model in models} == {"ollama", "lmstudio"}
    assert state["max_active_calls"] >= 2


@pytest.mark.asyncio
async def test_get_local_models_tolerates_partial_provider_failure(monkeypatch):
    state = {
        "active_calls": 0,
        "max_active_calls": 0,
        "lock": asyncio.Lock(),
    }
    factory = {
        "ollama": FakeLocalProvider("ollama", state, should_fail=True),
        "lmstudio": FakeLocalProvider("lmstudio", state),
    }
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert len(models) == 1
    assert models[0]["provider"] == "lmstudio"


def test_get_online_models_returns_defensive_copy():
    service = ModelService(AppConfig())

    models = service.get_online_models()
    models[0]["id"] = "mutated-id"

    refreshed = service.get_online_models()
    assert refreshed[0]["id"] != "mutated-id"


def test_get_all_online_models_deduplicates_provider_model_pairs():
    service = ModelService(AppConfig())

    models = service.get_all_online_models()
    ids = [(m["provider"], m["id"]) for m in models]

    assert len(ids) == len(set(ids))
    assert any(m.get("supports_thinking") for m in models)
