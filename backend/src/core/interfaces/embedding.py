from abc import ABC, abstractmethod
from typing import List, Union
import numpy as np

class EmbeddingProvider(ABC):
    """
    Abstract interface for embedding generation.
    Decouples the memory store from specific embedding libraries (e.g., SentenceTransformer, OpenAI).
    """

    @abstractmethod
    def embed_text(self, text: str) -> np.ndarray:
        """
        Embed a single text string into a vector.
        
        Args:
            text: The text to embed.
            
        Returns:
            A numpy array representing the embedding vector.
        """
        pass

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """
        Embed a batch of texts.
        
        Args:
            texts: List of strings to embed.
            
        Returns:
            List of numpy arrays.
        """
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Returns the dimension of the embeddings."""
        pass

