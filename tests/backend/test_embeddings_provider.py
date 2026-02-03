import numpy as np
import pytest

from backend.src.embeddings import embeddings as embeddings_module
from backend.src.embeddings.embeddings import SentenceTransformerProvider


class DummyCache:
    def __init__(self):
        self._data = {}

    def get(self, key):
        return self._data.get(key)

    def set(self, key, value):
        self._data[key] = value


class DummyCacheManager:
    def __init__(self):
        self.embeddings = DummyCache()

    def get_embedding_key(self, text):
        return f"key:{text}"


class DummyModel:
    def __init__(self, name, device="cpu"):
        self.name = name
        self.device = device
        self.encode_calls = []

    def get_sentence_embedding_dimension(self):
        return 3

    def encode(self, texts, convert_to_numpy=True):
        self.encode_calls.append(texts)
        if isinstance(texts, list):
            return np.array([[len(text)] * 3 for text in texts], dtype=np.float32)
        return np.array([len(texts)] * 3, dtype=np.float32)


@pytest.mark.asyncio
async def test_provider_initialization_and_dimension(monkeypatch):
    monkeypatch.setattr(embeddings_module, "SentenceTransformer", DummyModel)
    provider = SentenceTransformerProvider()

    with pytest.raises(RuntimeError):
        _ = provider.dimension

    await provider.initialize()
    assert provider.dimension == 3
    assert provider.model.name == "all-MiniLM-L6-v2"


@pytest.mark.asyncio
async def test_embed_text_uses_cache(monkeypatch):
    monkeypatch.setattr(embeddings_module, "SentenceTransformer", DummyModel)
    cache_manager = DummyCacheManager()
    provider = SentenceTransformerProvider(cache_manager=cache_manager)
    await provider.initialize()

    first = await provider.embed_text("hello")
    second = await provider.embed_text("hello")

    assert np.array_equal(first, second)
    assert provider.model.encode_calls.count("hello") == 1


@pytest.mark.asyncio
async def test_embed_batch_mixes_cached_and_new(monkeypatch):
    monkeypatch.setattr(embeddings_module, "SentenceTransformer", DummyModel)
    cache_manager = DummyCacheManager()
    cached = np.array([1.0, 1.0, 1.0], dtype=np.float32)
    cache_manager.embeddings.set(cache_manager.get_embedding_key("a"), cached)

    provider = SentenceTransformerProvider(cache_manager=cache_manager)
    await provider.initialize()

    embeddings = await provider.embed_batch(["a", "bb"])

    assert np.array_equal(embeddings[0], cached)
    assert np.array_equal(embeddings[1], np.array([2.0, 2.0, 2.0], dtype=np.float32))
