"""Pydantic schemas for backend `web_search`."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WebSearchArgs(BaseModel):
    """Arguments accepted by the backend Brave web-search fallback."""

    model_config = ConfigDict(extra="forbid")

    query: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Search query to run on the public web.",
    )
    count: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum number of results to return.",
    )
    domains: Optional[List[str]] = Field(
        default=None,
        description="Optional list of domains to constrain the search to.",
    )
    recency_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=3650,
        description="Optional recency hint in days.",
    )

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be empty")
        return normalized

    @field_validator("domains")
    @classmethod
    def validate_domains(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        normalized: List[str] = []
        for raw_domain in value:
            if not isinstance(raw_domain, str):
                raise ValueError("domains must contain strings")
            candidate = raw_domain.strip().lower()
            if not candidate:
                continue
            normalized.append(candidate)
        if not normalized:
            return None
        if len(normalized) > 10:
            raise ValueError("domains may contain at most 10 entries")
        return normalized

