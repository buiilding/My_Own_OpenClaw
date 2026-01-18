"""Coordinate resolution for tool preparation."""

from backend.src.agent.tools.resolvers.coordinate_resolvers import (
    CoordinateResolver,
    OcrResolver,
    VisionResolver,
)

__all__ = [
    "CoordinateResolver",
    "OcrResolver",
    "VisionResolver",
]
