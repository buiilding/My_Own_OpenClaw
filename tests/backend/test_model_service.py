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


class DuplicateLocalProvider:
    async def list_models(self):
        return [
            {"id": "dup-model", "provider": "ollama", "display_name": "ollama/dup-model"},
            {"id": "dup-model", "provider": "ollama", "display_name": "ollama/dup-model"},
        ]


class SharedModelProvider:
    def __init__(self) -> None:
        self._shared = {
            "id": "shared-model",
            "provider": "ollama",
            "display_name": "ollama/shared-model",
        }

    async def list_models(self):
        return [self._shared]


class MalformedModelsProvider:
    def __init__(self, payload):
        self.payload = payload

    async def list_models(self):
        return self.payload


class GeneratorModelsProvider:
    async def list_models(self):
        return (
            item
            for item in [
                {"id": "g-model", "provider": "ollama", "display_name": "ollama/g-model"},
                {"id": "", "provider": "ollama"},
            ]
        )


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


@pytest.mark.asyncio
async def test_get_local_models_deduplicates_provider_model_pairs(monkeypatch):
    factory = {
        "ollama": DuplicateLocalProvider(),
        "lmstudio": DuplicateLocalProvider(),
    }
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert len(models) == 1
    assert models[0]["provider"] == "ollama"
    assert models[0]["id"] == "dup-model"


@pytest.mark.asyncio
async def test_get_local_models_returns_defensive_copy(monkeypatch):
    factory = {"ollama": SharedModelProvider()}
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    first = await service.get_local_models()
    first[0]["id"] = "mutated-id"

    second = await service.get_local_models()
    assert second[0]["id"] == "shared-model"


@pytest.mark.asyncio
async def test_get_local_models_ignores_non_list_provider_payload(monkeypatch):
    factory = {"ollama": MalformedModelsProvider({"id": "not-a-list"})}
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert models == []


@pytest.mark.asyncio
async def test_get_local_models_filters_invalid_model_entries(monkeypatch):
    factory = {
        "ollama": MalformedModelsProvider(
            [
                {"id": "valid-model", "provider": "ollama", "display_name": "ollama/valid-model"},
                {"id": "", "provider": "ollama"},
                {"id": "missing-provider"},
                "not-a-dict",
            ]
        )
    }
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert models == [
        {"id": "valid-model", "provider": "ollama", "display_name": "ollama/valid-model"}
    ]


@pytest.mark.asyncio
async def test_get_local_models_accepts_iterable_provider_payloads(monkeypatch):
    factory = {"ollama": GeneratorModelsProvider()}
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert models == [
        {"id": "g-model", "provider": "ollama", "display_name": "ollama/g-model"}
    ]


@pytest.mark.asyncio
async def test_get_local_models_trims_provider_and_model_identifiers(monkeypatch):
    factory = {
        "ollama": MalformedModelsProvider(
            [
                {
                    "id": "  spaced-model  ",
                    "provider": "  ollama  ",
                    "display_name": "ollama/spaced-model",
                }
            ]
        )
    }
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert models == [
        {
            "id": "spaced-model",
            "provider": "ollama",
            "display_name": "ollama/spaced-model",
        }
    ]


@pytest.mark.asyncio
async def test_get_local_models_trims_nonempty_display_name(monkeypatch):
    factory = {
        "ollama": MalformedModelsProvider(
            [
                {
                    "id": "valid-model",
                    "provider": "ollama",
                    "display_name": "  ollama/valid-model  ",
                }
            ]
        )
    }
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert models == [
        {
            "id": "valid-model",
            "provider": "ollama",
            "display_name": "ollama/valid-model",
        }
    ]


@pytest.mark.asyncio
async def test_get_local_models_sets_default_display_name_when_missing(monkeypatch):
    factory = {
        "ollama": MalformedModelsProvider(
            [
                {
                    "id": "valid-model",
                    "provider": "ollama",
                    "display_name": "   ",
                }
            ]
        )
    }
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )

    service = ModelService(AppConfig())
    models = await service.get_local_models()

    assert models == [
        {
            "id": "valid-model",
            "provider": "ollama",
            "display_name": "ollama/valid-model",
        }
    ]


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
