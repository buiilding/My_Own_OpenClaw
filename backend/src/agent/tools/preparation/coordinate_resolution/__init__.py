"""Coordinate resolution."""

from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
    CoordinateResolver,
    OcrCoordinateResolver,
    VisionCoordinateResolver,
)

__all__ = [
    "CoordinateResolver",
    "OcrCoordinateResolver",
    "VisionCoordinateResolver",
]
