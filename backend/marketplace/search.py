"""
Tool Search Engine for the Desktop Assistant Marketplace.

This module provides semantic search capabilities to find relevant
marketplace tools based on natural language queries.
"""

import logging
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None
    logger = logging.getLogger(__name__)
    logger.warning(
        "sentence-transformers not available. Tool search will use simple text matching."
    )

from .registry import MarketplaceRegistry, ToolMetadata

logger = logging.getLogger(__name__)

# Default embedding model (same as memory system)
DEFAULT_EMBEDDING_MODEL = "all-MiniLM-L6-v2"


@dataclass
class ToolSearchResult:
    """Result of a tool search."""

    tool_name: str
    similarity_score: float
    metadata: ToolMetadata

    def __str__(self) -> str:
        return f"{self.tool_name} (score: {self.similarity_score:.3f})"


class ToolSearchEngine:
    """Semantic search engine for marketplace tools."""

    def __init__(
        self,
        marketplace_registry: MarketplaceRegistry,
        embedding_model: str = DEFAULT_EMBEDDING_MODEL,
    ):
        """
        Initialize the tool search engine.

        Args:
            marketplace_registry: Marketplace registry instance
            embedding_model: Name of the sentence transformer model to use
        """
        self.marketplace_registry = marketplace_registry
        self.embedding_model_name = embedding_model
        self.embedder: Optional[SentenceTransformer] = None
        self.tool_embeddings: dict[str, np.ndarray] = {}
        self.tool_metadata: dict[str, ToolMetadata] = {}
        self._is_indexed = False

        if SentenceTransformer is not None:
            try:
                # Use CUDA for sentence transformers for better performance
                self.embedder = SentenceTransformer(embedding_model, device="cuda")
                logger.info(
                    f"Initialized tool search engine with model: {embedding_model} on CUDA"
                )
            except Exception as e:
                logger.error(f"Failed to load embedding model {embedding_model}: {e}")
                self.embedder = None
        else:
            logger.warning(
                "SentenceTransformer not available, using simple text matching"
            )

    def index_tools(self) -> None:
        """
        Index all tools from the marketplace registry for search.

        This should be called after tools are loaded into the registry.
        """
        if self.embedder is None:
            logger.warning("Cannot index tools without embedding model")
            return

        self.tool_embeddings = {}
        self.tool_metadata = {}

        tools = self.marketplace_registry.tools
        if not tools:
            logger.warning("No tools to index")
            return

        logger.info(f"Indexing {len(tools)} tools for search")

        for tool_name, metadata in tools.items():
            # Create searchable text from tool metadata
            searchable_text = self._create_searchable_text(metadata)

            try:
                # Generate embedding
                embedding = self.embedder.encode(searchable_text, convert_to_numpy=True)
                # Normalize for cosine similarity
                embedding = embedding / np.linalg.norm(embedding)

                self.tool_embeddings[tool_name] = embedding
                self.tool_metadata[tool_name] = metadata

            except Exception as e:
                logger.error(f"Failed to index tool {tool_name}: {e}")
                continue

        self._is_indexed = True
        logger.info(f"Indexed {len(self.tool_embeddings)} tools")

    def _create_searchable_text(self, metadata: ToolMetadata) -> str:
        """
        Create searchable text from tool metadata.

        Args:
            metadata: Tool metadata

        Returns:
            Searchable text string
        """
        parts = [
            metadata.name,
            metadata.description,
            metadata.category,
        ]

        # Add tags if available
        if hasattr(metadata.manifest, "tags") and metadata.manifest.tags:
            parts.extend(metadata.manifest.tags)

        return " ".join(parts).lower()

    def search(self, query: str, limit: int = 5) -> List[ToolSearchResult]:
        """
        Search for tools using semantic similarity.

        Args:
            query: Natural language search query
            limit: Maximum number of results to return

        Returns:
            List of ToolSearchResult sorted by similarity score (descending)
        """
        if not self._is_indexed or not self.tool_embeddings:
            logger.warning("Tools not indexed yet, calling index_tools()")
            self.index_tools()

        if not self.tool_embeddings:
            logger.warning("No tools indexed, returning empty results")
            return []

        if self.embedder is None:
            # Fallback to simple text matching
            return self._simple_text_search(query, limit)

        try:
            # Generate query embedding
            query_embedding = self.embedder.encode(query, convert_to_numpy=True)
            query_embedding = query_embedding / np.linalg.norm(query_embedding)

            # Compute cosine similarity with all tools
            results = []
            for tool_name, tool_embedding in self.tool_embeddings.items():
                similarity = np.dot(query_embedding, tool_embedding)
                metadata = self.tool_metadata[tool_name]

                results.append(
                    ToolSearchResult(
                        tool_name=tool_name,
                        similarity_score=float(similarity),
                        metadata=metadata,
                    )
                )

            # Sort by similarity score (descending)
            results.sort(key=lambda x: x.similarity_score, reverse=True)

            # Return top results
            return results[:limit]

        except Exception as e:
            logger.error(f"Error during semantic search: {e}", exc_info=True)
            return self._simple_text_search(query, limit)

    def _simple_text_search(self, query: str, limit: int = 5) -> List[ToolSearchResult]:
        """
        Fallback simple text search when embeddings are not available.

        Args:
            query: Search query
            limit: Maximum number of results

        Returns:
            List of ToolSearchResult
        """
        query_lower = query.lower()
        query_words = set(query_lower.split())

        results = []
        for tool_name, metadata in self.marketplace_registry.tools.items():
            searchable_text = self._create_searchable_text(metadata)
            searchable_words = set(searchable_text.split())

            # Simple word overlap scoring
            overlap = len(query_words & searchable_words)
            if overlap > 0:
                # Normalize score by query length
                score = overlap / len(query_words) if query_words else 0.0

                results.append(
                    ToolSearchResult(
                        tool_name=tool_name,
                        similarity_score=score,
                        metadata=metadata,
                    )
                )

        # Sort by score (descending)
        results.sort(key=lambda x: x.similarity_score, reverse=True)

        return results[:limit]

    def find_tool_by_name(self, tool_name: str) -> Optional[ToolSearchResult]:
        """
        Find a tool by exact name match.

        Args:
            tool_name: Exact tool name

        Returns:
            ToolSearchResult or None
        """
        metadata = self.marketplace_registry.get_tool_metadata(tool_name)
        if metadata:
            return ToolSearchResult(
                tool_name=tool_name, similarity_score=1.0, metadata=metadata
            )
        return None

    def get_indexed_count(self) -> int:
        """Get the number of indexed tools."""
        return len(self.tool_embeddings)
