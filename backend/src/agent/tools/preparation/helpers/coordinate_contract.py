"""
Canonical coordinate-space contract + normalization helpers.

Centralizes conversion from screenshot pixel space (OCR/vision output) to
display pixel space (pyautogui input).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, Tuple, TypedDict

CoordinateSpace = Literal["screenshot_px", "display_px"]


class CoordinateSizeDict(TypedDict):
    width: int
    height: int


class CoordinatePointDict(TypedDict):
    x: int
    y: int


class CoordinateContractDict(TypedDict):
    coordinate_space: CoordinateSpace
    source_coordinates: CoordinatePointDict
    source_image_size: Optional[CoordinateSizeDict]
    target_display_size: Optional[CoordinateSizeDict]
    normalized_coordinates: CoordinatePointDict
    normalized_space: Literal["display_px"]
    normalization_status: str


@dataclass(frozen=True)
class CoordinateContract:
    """
    Canonical contract for one resolved coordinate pair.

    `coordinate_space` identifies the input coordinate system. Normalization always
    returns display pixel coordinates.
    """

    x: int
    y: int
    coordinate_space: CoordinateSpace
    source_image_size: Optional[Tuple[int, int]]
    target_display_size: Optional[Tuple[int, int]]


@dataclass(frozen=True)
class NormalizedCoordinates:
    """Normalized coordinates in display pixel space + status for diagnostics."""

    x: int
    y: int
    status: str


def normalize_to_display_space(contract: CoordinateContract) -> NormalizedCoordinates:
    """
    Normalize one coordinate contract into display pixel space.

    Status values:
    - `already_display_space`
    - `missing_source_image_size`
    - `missing_target_display_size`
    - `invalid_dimensions`
    - `source_equals_target`
    - `scaled_to_display`
    """
    if contract.coordinate_space == "display_px":
        return NormalizedCoordinates(contract.x, contract.y, "already_display_space")

    source = contract.source_image_size
    target = contract.target_display_size
    if not source:
        return NormalizedCoordinates(contract.x, contract.y, "missing_source_image_size")
    if not target:
        return NormalizedCoordinates(contract.x, contract.y, "missing_target_display_size")

    source_w, source_h = source
    target_w, target_h = target
    if source_w <= 0 or source_h <= 0 or target_w <= 0 or target_h <= 0:
        return NormalizedCoordinates(contract.x, contract.y, "invalid_dimensions")

    if (source_w, source_h) == (target_w, target_h):
        return NormalizedCoordinates(contract.x, contract.y, "source_equals_target")

    scale_x = target_w / source_w
    scale_y = target_h / source_h
    return NormalizedCoordinates(
        x=int(round(contract.x * scale_x)),
        y=int(round(contract.y * scale_y)),
        status="scaled_to_display",
    )


def _to_size_dict(value: Optional[Tuple[int, int]]) -> Optional[CoordinateSizeDict]:
    if not value:
        return None
    width, height = value
    return {"width": int(width), "height": int(height)}


def build_contract_metadata(
    contract: CoordinateContract,
    normalized: NormalizedCoordinates,
) -> CoordinateContractDict:
    """Render contract + normalized output as metadata-safe dict."""
    return {
        "coordinate_space": contract.coordinate_space,
        "source_coordinates": {"x": contract.x, "y": contract.y},
        "source_image_size": _to_size_dict(contract.source_image_size),
        "target_display_size": _to_size_dict(contract.target_display_size),
        "normalized_coordinates": {"x": normalized.x, "y": normalized.y},
        "normalized_space": "display_px",
        "normalization_status": normalized.status,
    }
