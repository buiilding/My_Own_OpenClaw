import json

import pytest

from backend.src.agent.tools.processing.synthetic_factory import SyntheticResultFactory
from backend.src.core.inference import (
    EmbeddingRouter,
    OcrRouter,
    ProviderCircuitOpenError,
    ProviderRequestError,
    ProviderUnavailableError,
    VisionRouter,
)
from backend.src.llm.parser_types import ParsedToolCall


class _FakeEmbeddingProvider:
    provider_id = "fake-embedding"
    model_id = "embedding-model"
    model_name = "embedding-model"
    dimension = 3

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def embed_text(self, text: str):
        self.calls.append(text)
        return [0.1, 0.2, 0.3]

    async def embed_batch(self, texts: list[str]):
        self.calls.extend(texts)
        return [[0.1, 0.2, 0.3] for _ in texts]


class _FakeOcrProvider:
    provider_id = "fake-ocr"
    model_id = "ocr-model"

    def __init__(self) -> None:
        self.enabled = True
        self.is_ready = True
        self.calls: list[str] = []

    async def initialize(self) -> None:
        return None

    async def health_check(self) -> bool:
        return self.enabled and self.is_ready

    async def analyze_image(self, image_base64: str):
        self.calls.append(image_base64)
        return [{"text": image_base64}]


class _FakeVisionProvider:
    provider_id = "fake-vision"
    model_id = "vision-model"
    model_name = "vision-model"

    def __init__(self) -> None:
        self.is_initialized = False
        self.initialization_error = None
        self.calls: list[tuple[str, str]] = []

    async def initialize(self) -> bool:
        self.is_initialized = True
        return True

    async def health_check(self) -> bool:
        return self.is_initialized and not self.initialization_error

    async def predict_coordinates(
        self,
        image_base64: str,
        description: str,
    ) -> tuple[int, int]:
        self.calls.append((image_base64, description))
        return (12, 34)

    async def answer_question_about_image(
        self,
        image_base64: str,
        prompt: str,
    ) -> str:
        self.calls.append((image_base64, prompt))
        return "description"


@pytest.mark.asyncio
async def test_embedding_router_delegates_to_current_provider() -> None:
    router = EmbeddingRouter(_FakeEmbeddingProvider())

    embedding = await router.embed_text("hello")

    assert embedding == [0.1, 0.2, 0.3]
    assert router.provider_id == "fake-embedding"
    assert router.model_id == "embedding-model"
    assert router.model_name == "embedding-model"


@pytest.mark.asyncio
async def test_embedding_router_supports_provider_swap() -> None:
    first = _FakeEmbeddingProvider()
    second = _FakeEmbeddingProvider()
    second.model_id = "other-model"
    second.model_name = "other-model"
    router = EmbeddingRouter(first)

    router.set_provider(second)
    await router.embed_text("world")

    assert first.calls == []
    assert second.calls == ["world"]
    assert router.model_id == "other-model"


@pytest.mark.asyncio
async def test_embedding_router_returns_structured_unavailable_error() -> None:
    router = EmbeddingRouter(None)

    with pytest.raises(ProviderUnavailableError) as exc_info:
        await router.embed_text("hello")

    assert exc_info.value.to_payload()["capability"] == "embeddings"
    assert exc_info.value.to_payload()["code"] == "provider_unavailable"


@pytest.mark.asyncio
async def test_embedding_router_opens_circuit_after_repeated_failures() -> None:
    class FailingProvider(_FakeEmbeddingProvider):
        async def embed_text(self, _text: str):
            raise RuntimeError("embedding endpoint down")

    router = EmbeddingRouter(
        FailingProvider(),
        failure_threshold=2,
        cooldown_seconds=30.0,
    )

    with pytest.raises(ProviderRequestError):
        await router.embed_text("first")
    with pytest.raises(ProviderRequestError):
        await router.embed_text("second")

    assert router.is_ready is False
    with pytest.raises(ProviderCircuitOpenError) as exc_info:
        await router.embed_text("third")
    assert exc_info.value.to_payload()["code"] == "circuit_open"


@pytest.mark.asyncio
async def test_ocr_router_delegates_and_exposes_enabled_state() -> None:
    provider = _FakeOcrProvider()
    router = OcrRouter(provider)

    results = await router.perform_ocr("image-b64")
    router.enabled = False

    assert results == [{"text": "image-b64"}]
    assert provider.calls == ["image-b64"]
    assert provider.enabled is False
    assert router.provider_id == "fake-ocr"


@pytest.mark.asyncio
async def test_ocr_router_rejects_not_ready_provider_before_invocation() -> None:
    provider = _FakeOcrProvider()
    provider.is_ready = False
    router = OcrRouter(provider)

    with pytest.raises(ProviderUnavailableError) as exc_info:
        await router.perform_ocr("image-b64")

    assert provider.calls == []
    payload = exc_info.value.to_payload()
    assert payload["capability"] == "ocr"
    assert payload["code"] == "provider_unavailable"
    assert payload["message"] == "OCR provider is not ready"


@pytest.mark.asyncio
async def test_vision_router_initializes_current_provider() -> None:
    provider = _FakeVisionProvider()
    router = VisionRouter(provider)

    initialized = await router.initialize()
    coordinates = await router.predict_coordinates("shot", "button")
    description = await router.answer_question_about_image("shot", "what is here?")

    assert initialized is True
    assert router.is_initialized is True
    assert coordinates == (12, 34)
    assert description == "description"
    assert provider.calls == [("shot", "button"), ("shot", "what is here?")]
    assert router.provider_id == "fake-vision"


@pytest.mark.asyncio
async def test_ocr_router_opens_circuit_after_repeated_failures() -> None:
    class FailingProvider(_FakeOcrProvider):
        async def analyze_image(self, _image_base64: str):
            raise RuntimeError("ocr endpoint down")

    router = OcrRouter(
        FailingProvider(),
        failure_threshold=2,
        cooldown_seconds=30.0,
    )

    with pytest.raises(ProviderRequestError):
        await router.perform_ocr("first")
    with pytest.raises(ProviderRequestError):
        await router.perform_ocr("second")

    assert router.is_ready is False
    with pytest.raises(ProviderCircuitOpenError) as exc_info:
        await router.perform_ocr("third")
    assert exc_info.value.to_payload()["code"] == "circuit_open"


@pytest.mark.asyncio
async def test_vision_router_returns_structured_provider_error_payload() -> None:
    class EmptyVisionProvider(_FakeVisionProvider):
        def __init__(self) -> None:
            super().__init__()
            self.is_initialized = True

        async def predict_coordinates(self, _image_base64: str, _description: str):
            return None

    router = VisionRouter(EmptyVisionProvider(), failure_threshold=1)

    with pytest.raises(ProviderRequestError) as exc_info:
        await router.predict_coordinates("shot", "button")

    payload = exc_info.value.to_payload()
    assert payload["type"] == "provider_error"
    assert payload["capability"] == "vision"
    assert payload["code"] == "provider_request_failed"
    assert "no coordinates" in payload["message"]


def test_synthetic_result_factory_preserves_provider_error_payload() -> None:
    payload = {
        "type": "provider_error",
        "capability": "ocr",
        "provider_id": "remote-http-ocr",
        "code": "provider_request_failed",
        "message": "Remote OCR service timed out",
    }
    error_msg = (
        "OCR provider error (provider_request_failed): Remote OCR service timed out. "
        f"provider_error_json={json.dumps(payload, separators=(',', ':'))}"
    )

    result = SyntheticResultFactory.create(
        ParsedToolCall(tool_name="mouse_control", parameters={}),
        error_msg,
    )

    assert result.success is False
    assert result.data["provider_error"] == payload
