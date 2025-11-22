import logging
from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer

from backend.src.core.interfaces.embedding import EmbeddingProvider

logger = logging.getLogger(__name__)

class SentenceTransformerProvider(EmbeddingProvider):
    """
    Local embedding provider using SentenceTransformers.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", device: str = "cpu"):
        logger.info(f"Loading embedding model: {model_name} on {device}")
        self.model = SentenceTransformer(model_name, device=device)
        self._dimension = self.model.get_sentence_embedding_dimension()

    def embed_text(self, text: str) -> np.ndarray:
        return self.model.encode(text, convert_to_numpy=True)

    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return [e for e in embeddings]

    @property
    def dimension(self) -> int:
        return self._dimension

