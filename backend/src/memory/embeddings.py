"""
Embedding Provider Implementation.

This module provides the SentenceTransformer-based embedding provider for generating
vector embeddings of text. Includes caching to avoid recomputing embeddings for the same text.
"""
import logging
from typing import List
import numpy as np
from sentence_transformers import SentenceTransformer

from backend.src.core.interfaces.embedding import EmbeddingProvider

logger = logging.getLogger(__name__)

class SentenceTransformerProvider(EmbeddingProvider):
    """
    Local embedding provider using SentenceTransformers.
    Uses caching to avoid recomputing embeddings for the same text.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", device: str = "cpu"):
        logger.info(f"Loading embedding model: {model_name} on {device}")
        self.model = SentenceTransformer(model_name, device=device)
        self._dimension = self.model.get_sentence_embedding_dimension()
        self._use_cache = True  # Enable caching by default

    def embed_text(self, text: str) -> np.ndarray:
        """Generate embedding for text, using cache if available."""
        if self._use_cache:
            from backend.src.core.cache import cache_manager
            
            cache_key = cache_manager.get_embedding_key(text)
            cached_embedding = cache_manager.embeddings.get(cache_key)
            
            if cached_embedding is not None:
                return cached_embedding
            
            # Generate embedding
            embedding = self.model.encode(text, convert_to_numpy=True)
            
            # Cache it
            cache_manager.embeddings.set(cache_key, embedding)
            return embedding
        else:
            embedding = self.model.encode(text, convert_to_numpy=True)
            return embedding

    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Generate embeddings for a batch of texts."""
        if self._use_cache:
            from backend.src.core.cache import cache_manager
            
            embeddings = []
            texts_to_encode = []
            indices_to_encode = []
            
            # Check cache for each text
            for i, text in enumerate(texts):
                cache_key = cache_manager.get_embedding_key(text)
                cached_embedding = cache_manager.embeddings.get(cache_key)
                
                if cached_embedding is not None:
                    embeddings.append((i, cached_embedding))
                else:
                    texts_to_encode.append(text)
                    indices_to_encode.append(i)
            
            # Generate embeddings for uncached texts
            if texts_to_encode:
                new_embeddings = self.model.encode(texts_to_encode, convert_to_numpy=True)
                
                # Cache new embeddings
                for text, embedding in zip(texts_to_encode, new_embeddings):
                    cache_key = cache_manager.get_embedding_key(text)
                    cache_manager.embeddings.set(cache_key, embedding)
                
                # Add to results
                for idx, embedding in zip(indices_to_encode, new_embeddings):
                    embeddings.append((idx, embedding))
            
            # Sort by original index and return embeddings only
            embeddings.sort(key=lambda x: x[0])
            return [emb for _, emb in embeddings]
        else:
            embeddings = self.model.encode(texts, convert_to_numpy=True)
            return [e for e in embeddings]

    @property
    def dimension(self) -> int:
        return self._dimension

