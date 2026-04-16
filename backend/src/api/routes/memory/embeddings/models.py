"""Pydantic models for embeddings routes."""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class EmbeddingRequest(BaseModel):
    """Request model for embedding generation."""

    text: str = Field(..., min_length=1, max_length=8192, description="Text to embed")
    model_name: str = Field(
        default="default",
        min_length=1,
        max_length=128,
        description="Model name for embedding generation",
    )


class EmbeddingResponse(BaseModel):
    """Response model for embedding generation."""

    embedding: List[float]
    provider_id: str
    model_id: str
    model_name: str
    dimension: int
    embedding_space_version: str
