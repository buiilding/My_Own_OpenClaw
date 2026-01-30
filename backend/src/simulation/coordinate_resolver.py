"""
Simulation Coordinate Resolver.

This module re-exports the production coordinate resolvers for use in simulation mode.
Simulation uses the same coordinate resolution logic as production.
"""
from backend.src.agent.tools.preparation.coordinate_resolution.resolvers import (
    OcrResolver,
    VisionResolver,
    CoordinateResolver
)

# Re-export for backward compatibility
__all__ = ['OcrResolver', 'VisionResolver', 'CoordinateResolver']
