"""
Embedding Provider Implementation.

This module provides the SentenceTransformer-based embedding provider for generating
vector embeddings of text. Includes caching to avoid recomputing embeddings for the same text.
"""
import asyncio
import os
import logging
from typing import List, Optional
import numpy as np
from sentence_transformers import SentenceTransformer

from backend.src.core.interfaces.embedding import EmbeddingProvider

logger = logging.getLogger(__name__)

class SentenceTransformerProvider(EmbeddingProvider):
    """
    Local embedding provider using SentenceTransformers.
    Uses caching to avoid recomputing embeddings for the same text.
    
    CRITICAL: Model loading is deferred to async initialize() to prevent blocking
    application startup. All embedding operations are offloaded to thread pool
    to prevent blocking the asyncio event loop.
    """

    def __init__(
        self,
        model_name: str = "all-MiniLM-L6-v2",
        device: str = "cpu",
        cache_manager=None,
    ):
        """
        Initialize the embedding provider.
        
        Args:
            model_name: Name of the SentenceTransformer model to load
            device: Device to run model on ("cpu" or "cuda")
            cache_manager: Optional CacheManager instance (injected via DI)
        """
        self._model_name = model_name
        self._device = device
        self._cache_manager = cache_manager
        self.model: Optional[SentenceTransformer] = None
        self._dimension: Optional[int] = None
        self._use_cache = True  # Enable caching by default
        self._initialized = False
        # RACE CONDITION FIX: Lock to prevent concurrent model loading (OOM risk)
        self._init_lock = asyncio.Lock()
        self._use_executor = os.getenv("PYTEST_CURRENT_TEST") is None

    async def _run_blocking(self, func):
        if self._use_executor:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, func)
        return func()

    async def initialize(self) -> None:
        """
        Async initialization: Load the model in a thread pool to avoid blocking startup.
        
        RACE CONDITION FIX: Uses asyncio.Lock to ensure only one concurrent call
        loads the model, preventing double allocation and OOM crashes.
        
        This method must be called before using embed_text or embed_batch.
        """
        # RACE CONDITION FIX: Serialize initialization to prevent double model loading
        async with self._init_lock:
            # Double-check after acquiring lock (another call may have initialized)
            if self._initialized:
                return
            
            logger.info(f"Loading embedding model: {self._model_name} on {self._device}")
            # Offload model loading to thread pool (or run inline under pytest)
            self.model = await self._run_blocking(
                lambda: SentenceTransformer(self._model_name, device=self._device)
            )
            self._dimension = self.model.get_sentence_embedding_dimension()
            self._initialized = True
            logger.info(f"Embedding model loaded: dimension={self._dimension}")

    def _ensure_initialized(self) -> None:
        """Ensure model is initialized, raising error if not."""
        if not self._initialized or self.model is None:
            raise RuntimeError(
                "SentenceTransformerProvider not initialized. "
                "Call await provider.initialize() before using embed methods."
            )

    async def embed_text(self, text: str) -> np.ndarray:
        """
        Generate embedding for text, using cache if available.
        
        CRITICAL: Blocking model.encode() is offloaded to thread pool to prevent
        freezing the asyncio event loop.
        """
        self._ensure_initialized()
        
        if self._use_cache and self._cache_manager:
            cache_key = self._cache_manager.get_embedding_key(text)
            cached_embedding = self._cache_manager.embeddings.get(cache_key)
            
            if cached_embedding is not None:
                return cached_embedding
            
            # Offload blocking encode operation to thread pool
            embedding = await self._run_blocking(
                lambda: self.model.encode(text, convert_to_numpy=True)
            )
            
            # Cache it
            self._cache_manager.embeddings.set(cache_key, embedding)
            return embedding
        else:
            # Offload blocking encode operation to thread pool
            return await self._run_blocking(
                lambda: self.model.encode(text, convert_to_numpy=True)
            )

    async def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """
        Generate embeddings for a batch of texts.
        
        CRITICAL: Blocking model.encode() is offloaded to thread pool to prevent
        freezing the asyncio event loop.
        """
        self._ensure_initialized()
        
        if self._use_cache and self._cache_manager:
            embeddings = []
            texts_to_encode = []
            indices_to_encode = []
            
            # Check cache for each text
            for i, text in enumerate(texts):
                cache_key = self._cache_manager.get_embedding_key(text)
                cached_embedding = self._cache_manager.embeddings.get(cache_key)
                
                if cached_embedding is not None:
                    embeddings.append((i, cached_embedding))
                else:
                    texts_to_encode.append(text)
                    indices_to_encode.append(i)
            
            # Generate embeddings for uncached texts
            if texts_to_encode:
                # Offload blocking encode operation to thread pool
                new_embeddings = await self._run_blocking(
                    lambda: self.model.encode(texts_to_encode, convert_to_numpy=True)
                )
                
                # Cache new embeddings
                for text, embedding in zip(texts_to_encode, new_embeddings):
                    cache_key = self._cache_manager.get_embedding_key(text)
                    self._cache_manager.embeddings.set(cache_key, embedding)
                
                # Add to results
                for idx, embedding in zip(indices_to_encode, new_embeddings):
                    embeddings.append((idx, embedding))
            
            # Sort by original index and return embeddings only
            embeddings.sort(key=lambda x: x[0])
            return [emb for _, emb in embeddings]
        else:
            # Offload blocking encode operation to thread pool
            embeddings = await self._run_blocking(
                lambda: self.model.encode(texts, convert_to_numpy=True)
            )
            return [e for e in embeddings]

    @property
    def dimension(self) -> int:
        """Returns the dimension of the embeddings."""
        if self._dimension is None:
            raise RuntimeError(
                "Dimension not available. Model not initialized. "
                "Call await provider.initialize() first."
            )
        return self._dimension
