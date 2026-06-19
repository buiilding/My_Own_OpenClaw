"""Covers model service behavior in the backend test suite."""

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
    def __init__(self, provider_name: str) -> None:
        self.provider_name = provider_name

    async def list_models(self):
        return [
            {
                "id": "dup-model",
                "provider": self.provider_name,
                "display_name": f"{self.provider_name}/dup-model",
            },
            {
                "id": "dup-model",
                "provider": self.provider_name,
                "display_name": f"{self.provider_name}/dup-model",
            },
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
                {
                    "id": "g-model",
                    "provider": "ollama",
                    "display_name": "ollama/g-model",
                },
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
        "backend.src.llm.providers.factory.create_provider_factory",
        lambda _cfg: factory,
    )
    service = ModelService(AppConfig(model_mode="local"))
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
        "ollama": DuplicateLocalProvider("ollama"),
        "lmstudio": DuplicateLocalProvider("lmstudio"),
    }
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert [(model["provider"], model["id"]) for model in models] == [
        ("ollama", "dup-model"),
        ("lmstudio", "dup-model"),
    ]


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
                {
                    "id": "valid-model",
                    "provider": "ollama",
                    "display_name": "ollama/valid-model",
                },
                {"id": "", "provider": "ollama"},
                {"id": "missing-provider"},
                "not-a-dict",
            ]
        )
    }
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert models == [
        {
            "id": "valid-model",
            "provider": "ollama",
            "display_name": "ollama/valid-model",
            "runtime_model_id": "valid-model",
        }
    ]


@pytest.mark.asyncio
async def test_get_local_models_accepts_iterable_provider_payloads(monkeypatch):
    factory = {"ollama": GeneratorModelsProvider()}
    models = await _get_local_models_with_factory(monkeypatch, factory)

    assert models == [
        {
            "id": "g-model",
            "provider": "ollama",
            "display_name": "ollama/g-model",
            "runtime_model_id": "g-model",
        }
    ]


@pytest.mark.asyncio
async def test_get_local_models_skips_provider_discovery_in_online_mode(monkeypatch):
    def _should_not_be_called(_cfg):
        raise AssertionError(
            "create_provider_factory should not be called in online mode"
        )

    monkeypatch.setattr(
        "backend.src.llm.providers.factory.create_provider_factory",
        _should_not_be_called,
    )
    service = ModelService(AppConfig(model_mode="online"))

    models = await service.get_local_models()

    assert models == []


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
                "runtime_model_id": "spaced-model",
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
                "runtime_model_id": "valid-model",
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
                "runtime_model_id": "valid-model",
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
    models[0]["strengths"][0] = "mutated-strength"

    refreshed = service.get_online_models()
    assert refreshed[0]["id"] != "mutated-id"
    assert refreshed[0]["strengths"][0] != "mutated-strength"


def test_get_all_online_models_deduplicates_provider_model_pairs():
    service = ModelService(AppConfig())

    models = service.get_all_online_models()
    ids = [(m["provider"], m["id"]) for m in models]

    assert len(ids) == len(set(ids))
    assert any(m.get("supports_thinking") for m in models)


def test_get_all_online_models_provider_first_entries_are_consumer_defaults():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    first_by_provider = {}
    for model in models:
        provider = model.get("provider")
        if provider and provider not in first_by_provider:
            first_by_provider[provider] = model

    assert first_by_provider["openai"]["runtime_model_id"] == "gpt-5.4"
    assert first_by_provider["openai"]["supports_thinking"] is True
    assert (
        first_by_provider["anthropic"]["runtime_model_id"]
        == "claude-sonnet-4-5-20250929"
    )
    assert first_by_provider["gemini"]["runtime_model_id"] == "gemini-2.5-flash"
    assert first_by_provider["mistral"]["runtime_model_id"] == "mistral-large-latest"
    assert first_by_provider["openrouter"]["runtime_model_id"] == "openrouter/auto"
    assert first_by_provider["kimi-coding"]["runtime_model_id"] == "k2p5"


def test_get_all_online_models_marks_gemini_3_pro_preview_as_thinking_text_stream_capable():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    gemini_3_pro_preview = next(
        (
            model
            for model in models
            if model.get("provider") == "gemini"
            and model.get("runtime_model_id") == "gemini-3-pro-preview"
            and model.get("supports_thinking") is True
        ),
        None,
    )
    assert gemini_3_pro_preview is not None
    assert gemini_3_pro_preview.get("supports_thinking") is True
    assert gemini_3_pro_preview.get("supports_thinking_text_stream") is True


def test_get_all_online_models_marks_gemini_3_flash_preview_as_thinking_text_stream_capable():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    gemini_3_flash_preview = next(
        (
            model
            for model in models
            if model.get("provider") == "gemini"
            and model.get("runtime_model_id") == "gemini-3-flash-preview"
            and model.get("supports_thinking") is True
        ),
        None,
    )
    assert gemini_3_flash_preview is not None
    assert gemini_3_flash_preview.get("supports_thinking") is True
    assert gemini_3_flash_preview.get("supports_thinking_text_stream") is True


def test_get_all_online_models_marks_openai_gpt_5_4_as_thinking_text_stream_capable():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    gpt_5_4 = next(
        (
            model
            for model in models
            if model.get("provider") == "openai"
            and model.get("runtime_model_id") == "gpt-5.4"
            and model.get("supports_thinking") is True
        ),
        None,
    )
    assert gpt_5_4 is not None
    assert gpt_5_4.get("supports_thinking") is True
    assert gpt_5_4.get("supports_thinking_text_stream") is True
    assert gpt_5_4.get("family_id") == "openai::gpt-5.4"
    assert gpt_5_4.get("family_label") == "GPT-5.4"
    assert gpt_5_4.get("default_model_id") == "gpt-5.4@@gpt-5-4-none-thinking"
    assert gpt_5_4.get("default_reasoning_mode") == "none"
    assert gpt_5_4.get("reasoning_modes") == ["none", "low", "medium", "high", "xhigh"]
    assert gpt_5_4.get("supports_native_web_search") is True
    assert gpt_5_4.get("capabilities") == {
        "supports_native_web_search": True,
    }


def test_get_all_online_models_includes_openai_gpt_5_5_reasoning_family():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    gpt_5_5_variants = [
        model
        for model in models
        if model.get("provider") == "openai"
        and model.get("runtime_model_id") == "gpt-5.5"
    ]

    assert {model.get("reasoning_mode") for model in gpt_5_5_variants} == {
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
    }
    first_variant = gpt_5_5_variants[0]
    assert first_variant.get("supports_thinking") is True
    assert first_variant.get("supports_thinking_text_stream") is True
    assert first_variant.get("family_id") == "openai::gpt-5.5"
    assert first_variant.get("family_label") == "GPT-5.5"
    assert first_variant.get("default_model_id") == "gpt-5.5@@gpt-5-5-none-thinking"
    assert first_variant.get("default_reasoning_mode") == "none"
    assert first_variant.get("reasoning_modes") == [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
    ]
    assert first_variant.get("supports_native_web_search") is True
    assert first_variant.get("capabilities") == {
        "supports_native_web_search": True,
    }


def test_get_all_online_models_marks_gemini_3_1_pro_preview_as_non_thinking():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    gemini_3_1 = next(
        (
            model
            for model in models
            if model.get("provider") == "gemini"
            and model.get("runtime_model_id") == "gemini-3.1-pro-preview"
            and model.get("supports_thinking") is False
        ),
        None,
    )
    assert gemini_3_1 is not None
    assert gemini_3_1.get("supports_thinking") is False
    assert gemini_3_1.get("supports_thinking_text_stream") is None
    assert gemini_3_1.get("default_reasoning_mode") == "none"
    assert gemini_3_1.get("reasoning_modes") == ["none", "low", "high"]
    assert gemini_3_1.get("supports_native_web_search") is True


def test_get_all_online_models_marks_openrouter_qwen3_vl_as_thinking_text_stream_capable():
    service = ModelService(AppConfig())
    models = service.get_all_online_models()

    qwen3_vl = next(
        (
            model
            for model in models
            if model.get("provider") == "openrouter"
            and model.get("id") == "qwen/qwen3-vl-235b-a22b-thinking"
        ),
        None,
    )
    assert qwen3_vl is not None
    assert qwen3_vl.get("supports_thinking") is True
    assert qwen3_vl.get("supports_thinking_text_stream") is True


def test_get_online_models_includes_openrouter_qwen3_vl_235b_a22b_thinking():
    service = ModelService(AppConfig())
    models = service.get_online_models()

    assert any(
        model.get("provider") == "openrouter"
        and model.get("id") == "qwen/qwen3-vl-235b-a22b-thinking"
        for model in models
    )


def test_get_online_models_include_card_metadata_for_demo_catalog():
    service = ModelService(AppConfig())
    models = service.get_online_models()

    gemini_flash = next(
        model
        for model in models
        if model.get("provider") == "gemini"
        and model.get("runtime_model_id") == "gemini-2.5-flash"
        and model.get("supports_thinking") is False
    )
    openrouter_auto = next(
        model
        for model in models
        if model.get("provider") == "openrouter"
        and model.get("runtime_model_id") == "openrouter/auto"
    )

    assert gemini_flash["context_window"] == 1048576
    assert gemini_flash["input_price"] == "Free"
    assert gemini_flash["output_price"] == "Free"
    assert gemini_flash["latency"] == "~1.0s"
    assert gemini_flash["description"]
    assert gemini_flash["strengths"] == ["Fast", "Multimodal", "Search", "1M Context"]

    assert openrouter_auto["context_window"] == 2000000
    assert openrouter_auto["input_price"] == "Free"
    assert openrouter_auto["output_price"] == "Free"


def test_get_scripted_dev_models_returns_hidden_dev_catalog_entry():
    service = ModelService(AppConfig(model_mode="online"))

    models = service.get_scripted_dev_models()

    assert len(models) == 1
    scripted = models[0]
    assert scripted["id"] == "scripted-runtime"
    assert scripted["runtime_model_id"] == "scripted-runtime"
    assert scripted["provider"] == "scripted"
    assert scripted["display_name"] == "Scripted Runtime"
    assert scripted["family_id"] == "scripted::scripted-runtime"
    assert scripted["default_model_id"] == "scripted-runtime"
    assert scripted["supports_thinking"] is False
    assert scripted["supports_native_web_search"] is False
    assert scripted["capabilities"] == {"supports_native_web_search": False}
