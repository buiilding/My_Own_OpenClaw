import pytest

from backend.src.core.inference import EmbeddingRouter, OcrRouter, VisionRouter


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
