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

CUDA_ERROR_KEYWORDS = (
    "CUBLAS_STATUS_ALLOC_FAILED",
    "CUDA out of memory",
    "CUDA error",
    "cuda error",
    "cublas",
    "cudnn",
    "CUDNN_STATUS",
    "CUBLAS_STATUS",
    "out of memory",
)


def is_cuda_error(error: Exception) -> bool:
    """Return True when an embedding failure looks CUDA-related."""
    error_message = str(error)
    return any(keyword in error_message for keyword in CUDA_ERROR_KEYWORDS)

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
            await self._load_model(self._device)
            logger.info(f"Embedding model loaded: dimension={self._dimension}")

    async def _load_model(self, device: str) -> None:
        """Load or reload the sentence transformer on the requested device."""
        model = await self._run_blocking(
            lambda: SentenceTransformer(self._model_name, device=device)
        )
        self.model = model
        self._device = device
        self._dimension = model.get_sentence_embedding_dimension()
        self._initialized = True

    async def _reload_with_cpu(self) -> None:
        """Reload the embedding model on CPU after a CUDA runtime failure."""
        async with self._init_lock:
            if self._device == "cpu" and self.model is not None:
                return

            self._clear_cuda_cache_best_effort()
            logger.warning(
                "Embedding model hit a CUDA runtime failure. Reloading %s on CPU.",
                self._model_name,
            )
            await self._load_model("cpu")
            logger.info("Embedding model reloaded with CPU fallback")

    async def recover_from_cuda_runtime_failure(self, error: Exception) -> bool:
        """
        Best-effort public recovery hook for callers that want one outer retry.

        Returns True when the provider handled the failure by reloading on CPU and
        the caller should retry the embedding operation once.
        """
        if self._device != "cuda" or not is_cuda_error(error):
            return False
        await self._reload_with_cpu()
        return True

    @staticmethod
    def _clear_cuda_cache_best_effort() -> None:
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            return

    async def _encode_with_runtime_fallback(self, encode_fn, *, operation: str):
        try:
            return await self._run_blocking(encode_fn)
        except Exception as error:
            if self._device != "cuda" or not is_cuda_error(error):
                raise

            logger.warning(
                "Embedding %s failed on CUDA. Retrying with CPU fallback. Error: %s",
                operation,
                error,
            )
            await self._reload_with_cpu()
            return await self._run_blocking(encode_fn)

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
            
            embedding = await self._encode_with_runtime_fallback(
                lambda: self.model.encode(text, convert_to_numpy=True),
                operation="text",
            )
            
            # Cache it
            self._cache_manager.embeddings.set(cache_key, embedding)
            return embedding
        else:
            return await self._encode_with_runtime_fallback(
                lambda: self.model.encode(text, convert_to_numpy=True),
                operation="text",
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
                new_embeddings = await self._encode_with_runtime_fallback(
                    lambda: self.model.encode(texts_to_encode, convert_to_numpy=True),
                    operation="batch",
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
            embeddings = await self._encode_with_runtime_fallback(
                lambda: self.model.encode(texts, convert_to_numpy=True),
                operation="batch",
            )
            return [e for e in embeddings]

    @property
    def model_name(self) -> str:
        """Return configured embedding model name for health/reporting surfaces."""
        return self._model_name

    @property
    def dimension(self) -> int:
        """Returns the dimension of the embeddings."""
        if self._dimension is None:
            raise RuntimeError(
                "Dimension not available. Model not initialized. "
                "Call await provider.initialize() first."
            )
        return self._dimension
