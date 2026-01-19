"""Observability module for trust boundary metrics."""

from backend.src.core.observability.trust_boundary_metrics import (
    BoundaryViolationMetrics,
    MetricsService,
)

__all__ = [
    "BoundaryViolationMetrics",
    "MetricsService",
]
