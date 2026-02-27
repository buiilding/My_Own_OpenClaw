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


def _parallel_state() -> dict:
    return {
        "active_calls": 0,
        "max_active_calls": 0,
        "lock": asyncio.Lock(),
    }


async def _get_local_models_with_factory(monkeypatch, factory: dict):
    monkeypatch.setattr(
        "backend.src.llm.providers.create_provider_factory",
        lambda _cfg: factory,
    )
    service = ModelService(AppConfig())
    return await service.get_local_models()


@pytest.mark.asyncio
async def test_get_local_models_fetches_local_providers_in_parallel(monkeypatch):
    state = _parallel_state()
    factory = {
        "ollama": FakeLocalProvider("ollama", state),
        "lmstudio": FakeLocalProvider("lmstudio", state),
    }
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert len(models) == 2
    assert {model["provider"] for model in models} == {"ollama", "lmstudio"}
    assert state["max_active_calls"] >= 2


@pytest.mark.asyncio
async def test_get_local_models_tolerates_partial_provider_failure(monkeypatch):
    state = _parallel_state()
    factory = {
        "ollama": FakeLocalProvider("ollama", state, should_fail=True),
        "lmstudio": FakeLocalProvider("lmstudio", state),
    }
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert len(models) == 1
    assert models[0]["provider"] == "lmstudio"


@pytest.mark.asyncio
async def test_get_local_models_deduplicates_provider_model_pairs(monkeypatch):
    factory = {
        "ollama": DuplicateLocalProvider(),
        "lmstudio": DuplicateLocalProvider(),
    }
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert len(models) == 1
    assert models[0]["provider"] == "ollama"
    assert models[0]["id"] == "dup-model"


@pytest.mark.asyncio
async def test_get_local_models_returns_defensive_copy(monkeypatch):
    factory = {"ollama": SharedModelProvider()}
    first = await _get_local_models_with_factory(monkeypatch, factory)
    first[0]["id"] = "mutated-id"

    second = await _get_local_models_with_factory(monkeypatch, factory)
    assert second[0]["id"] == "shared-model"


@pytest.mark.asyncio
async def test_get_local_models_ignores_non_list_provider_payload(monkeypatch):
    factory = {"ollama": MalformedModelsProvider({"id": "not-a-list"})}
    models = await _get_local_models_with_factory(monkeypatch, factory)

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
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert models == [
        {"id": "valid-model", "provider": "ollama", "display_name": "ollama/valid-model"}
    ]


@pytest.mark.asyncio
async def test_get_local_models_accepts_iterable_provider_payloads(monkeypatch):
    factory = {"ollama": GeneratorModelsProvider()}
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert models == [
        {"id": "g-model", "provider": "ollama", "display_name": "ollama/g-model"}
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("raw_model", "expected_model"),
    [
        (
            {
                "id": "  spaced-model  ",
                "provider": "  ollama  ",
                "display_name": "ollama/spaced-model",
            },
            {
                "id": "spaced-model",
                "provider": "ollama",
                "display_name": "ollama/spaced-model",
            },
        ),
        (
            {
                "id": "valid-model",
                "provider": "ollama",
                "display_name": "  ollama/valid-model  ",
            },
            {
                "id": "valid-model",
                "provider": "ollama",
                "display_name": "ollama/valid-model",
            },
        ),
        (
            {
                "id": "valid-model",
                "provider": "ollama",
                "display_name": "   ",
            },
            {
                "id": "valid-model",
                "provider": "ollama",
                "display_name": "ollama/valid-model",
            },
        ),
    ],
)
async def test_get_local_models_normalizes_ids_provider_and_display_name(
    monkeypatch,
    raw_model,
    expected_model,
):
    factory = {"ollama": MalformedModelsProvider([raw_model])}
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert models == [expected_model]


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


def test_get_all_online_models_marks_gemini_3_1_as_thinking_text_stream_capable():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    gemini_3_1 = next(
        (
            model for model in models
            if model.get("provider") == "gemini"
            and model.get("id") == "gemini-3.1-pro-preview"
        ),
        None,
    )
    assert gemini_3_1 is not None
    assert gemini_3_1.get("supports_thinking") is True
    assert gemini_3_1.get("supports_thinking_text_stream") is True


def test_get_online_models_includes_openrouter_qwen3_vl_235b_a22b_thinking():
    service = ModelService(AppConfig())
    models = service.get_online_models()

    assert any(
        model.get("provider") == "openrouter"
        and model.get("id") == "qwen/qwen3-vl-235b-a22b-thinking"
        for model in models
    )
