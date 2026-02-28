"""
Canonical coordinate-space contract + normalization helpers.

Grounding coordinates from OCR/LLM are always interpreted as `screenshot_px`.
Runtime converts exactly once into `desktop_px` using capture metadata from the
same screenshot frame.
"""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Literal, Optional, TypedDict

from backend.src.agent.tools.preparation.helpers.image_dimensions import (
    get_image_dimensions_from_screenshot_b64,
)

CoordinateSpace = Literal["screenshot_px", "desktop_px"]


class CoordinateSizeDict(TypedDict):
    width: int
    height: int


class CoordinatePointDict(TypedDict):
    x: int
    y: int


class CaptureCropDict(TypedDict):
    x: int
    y: int
    width: int
    height: int


class DesktopBoundsDict(TypedDict):
    x: int
    y: int
    width: int
    height: int


class CaptureMetaDict(TypedDict):
    screenshot_id: Optional[str]
    source_w: int
    source_h: int
    crop_x: int
    crop_y: int
    crop_w: int
    crop_h: int
    desktop_virtual_bounds: Optional[DesktopBoundsDict]
    monitor_id: Optional[str]
    timestamp: int


class CoordinateContractDict(TypedDict):
    coordinate_space: CoordinateSpace
    screenshot_id: Optional[str]
    source_coordinates: CoordinatePointDict
    clamped_source_coordinates: CoordinatePointDict
    source_image_size: Optional[CoordinateSizeDict]
    capture_crop: Optional[CaptureCropDict]
    desktop_virtual_bounds: Optional[DesktopBoundsDict]
    normalized_coordinates: CoordinatePointDict
    normalized_space: Literal["desktop_px"]
    normalization_status: str


@dataclass(frozen=True)
class CoordinateContract:
    """
    Canonical contract for one resolved coordinate pair.

    `coordinate_space` identifies the input coordinate system. Normalization always
    returns desktop pixel coordinates.
    """

    x: int
    y: int
    coordinate_space: CoordinateSpace
    screenshot_id: Optional[str]
    capture_meta: Optional[CaptureMetaDict]


@dataclass(frozen=True)
class NormalizedCoordinates:
    """Normalized coordinates in desktop pixel space + status for diagnostics."""

    x: int
    y: int
    status: str
    clamped_source_x: int
    clamped_source_y: int


def _coerce_optional_str(value: object) -> Optional[str]:
    if isinstance(value, str):
        normalized = value.strip()
        if normalized:
            return normalized
    return None


def _coerce_int(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not value.is_integer():
            return None
        return int(value)
    return None


def _normalize_bounds(value: object) -> Optional[DesktopBoundsDict]:
    if not isinstance(value, dict):
        return None

    x = _coerce_int(value.get("x"))
    y = _coerce_int(value.get("y"))
    width = _coerce_int(value.get("width"))
    height = _coerce_int(value.get("height"))
    if x is None or y is None or width is None or height is None:
        return None
    if width <= 0 or height <= 0:
        return None
    return {
        "x": x,
        "y": y,
        "width": width,
        "height": height,
    }


def build_identity_capture_meta(
    *,
    screenshot_id: Optional[str],
    source_w: int,
    source_h: int,
    timestamp_ms: Optional[int] = None,
) -> CaptureMetaDict:
    """Build identity capture metadata when screenshot and desktop spaces match."""
    normalized_screenshot_id = _coerce_optional_str(screenshot_id)
    ts = timestamp_ms if isinstance(timestamp_ms, int) and timestamp_ms > 0 else int(time.time() * 1000)
    bounds: DesktopBoundsDict = {
        "x": 0,
        "y": 0,
        "width": int(source_w),
        "height": int(source_h),
    }
    return {
        "screenshot_id": normalized_screenshot_id,
        "source_w": int(source_w),
        "source_h": int(source_h),
        "crop_x": 0,
        "crop_y": 0,
        "crop_w": int(source_w),
        "crop_h": int(source_h),
        "desktop_virtual_bounds": bounds,
        "monitor_id": None,
        "timestamp": ts,
    }


def build_capture_meta_from_screenshot(
    *,
    screenshot_b64: str,
    screenshot_id: Optional[str],
    timestamp_ms: Optional[int] = None,
) -> Optional[CaptureMetaDict]:
    """Build fallback identity metadata using decoded screenshot dimensions."""
    dimensions = get_image_dimensions_from_screenshot_b64(screenshot_b64)
    if not dimensions:
        return None
    source_w, source_h = dimensions
    if source_w <= 0 or source_h <= 0:
        return None
    return build_identity_capture_meta(
        screenshot_id=screenshot_id,
        source_w=source_w,
        source_h=source_h,
        timestamp_ms=timestamp_ms,
    )


def normalize_capture_meta(
    raw_meta: object,
    *,
    screenshot_id: Optional[str] = None,
    fallback_screenshot_b64: Optional[str] = None,
) -> Optional[CaptureMetaDict]:
    """
    Validate + normalize capture metadata into a deterministic shape.

    If metadata is missing/invalid but screenshot bytes are available, falls back to
    identity metadata derived from screenshot dimensions.
    """
    raw = raw_meta if isinstance(raw_meta, dict) else {}

    source_w = _coerce_int(raw.get("source_w"))
    source_h = _coerce_int(raw.get("source_h"))
    if (
        (source_w is None or source_w <= 0 or source_h is None or source_h <= 0)
        and isinstance(fallback_screenshot_b64, str)
        and fallback_screenshot_b64.strip()
    ):
        fallback = build_capture_meta_from_screenshot(
            screenshot_b64=fallback_screenshot_b64,
            screenshot_id=screenshot_id,
        )
        if fallback:
            source_w = fallback["source_w"]
            source_h = fallback["source_h"]

    if source_w is None or source_w <= 0 or source_h is None or source_h <= 0:
        return None

    crop_x = _coerce_int(raw.get("crop_x"))
    crop_y = _coerce_int(raw.get("crop_y"))
    crop_w = _coerce_int(raw.get("crop_w"))
    crop_h = _coerce_int(raw.get("crop_h"))

    if crop_x is None:
        crop_x = 0
    if crop_y is None:
        crop_y = 0
    if crop_w is None or crop_w <= 0:
        crop_w = source_w
    if crop_h is None or crop_h <= 0:
        crop_h = source_h

    normalized_screenshot_id = (
        _coerce_optional_str(screenshot_id)
        or _coerce_optional_str(raw.get("screenshot_id"))
    )
    monitor_id = _coerce_optional_str(raw.get("monitor_id"))

    timestamp = _coerce_int(raw.get("timestamp"))
    if timestamp is None or timestamp <= 0:
        timestamp = int(time.time() * 1000)

    desktop_virtual_bounds = _normalize_bounds(raw.get("desktop_virtual_bounds"))

    return {
        "screenshot_id": normalized_screenshot_id,
        "source_w": int(source_w),
        "source_h": int(source_h),
        "crop_x": int(crop_x),
        "crop_y": int(crop_y),
        "crop_w": int(crop_w),
        "crop_h": int(crop_h),
        "desktop_virtual_bounds": desktop_virtual_bounds,
        "monitor_id": monitor_id,
        "timestamp": int(timestamp),
    }


def normalize_to_display_space(contract: CoordinateContract) -> NormalizedCoordinates:
    """
    Normalize one coordinate contract into desktop pixel space.

    Status values:
    - `already_desktop_space`
    - `missing_capture_meta`
    - `invalid_source_dimensions`
    - `invalid_crop_dimensions`
    - `source_equals_crop`
    - `scaled_to_desktop`
    - `scaled_to_desktop_clamped`
    """
    if contract.coordinate_space == "desktop_px":
        return NormalizedCoordinates(
            x=contract.x,
            y=contract.y,
            status="already_desktop_space",
            clamped_source_x=contract.x,
            clamped_source_y=contract.y,
        )

    capture_meta = contract.capture_meta
    if not capture_meta:
        return NormalizedCoordinates(
            x=contract.x,
            y=contract.y,
            status="missing_capture_meta",
            clamped_source_x=contract.x,
            clamped_source_y=contract.y,
        )

    source_w = int(capture_meta["source_w"])
    source_h = int(capture_meta["source_h"])
    crop_x = int(capture_meta["crop_x"])
    crop_y = int(capture_meta["crop_y"])
    crop_w = int(capture_meta["crop_w"])
    crop_h = int(capture_meta["crop_h"])

    if source_w <= 0 or source_h <= 0:
        return NormalizedCoordinates(
            x=contract.x,
            y=contract.y,
            status="invalid_source_dimensions",
            clamped_source_x=contract.x,
            clamped_source_y=contract.y,
        )
    if crop_w <= 0 or crop_h <= 0:
        return NormalizedCoordinates(
            x=contract.x,
            y=contract.y,
            status="invalid_crop_dimensions",
            clamped_source_x=contract.x,
            clamped_source_y=contract.y,
        )

    max_source_x = max(source_w - 1, 0)
    max_source_y = max(source_h - 1, 0)
    clamped_x = min(max(contract.x, 0), max_source_x)
    clamped_y = min(max(contract.y, 0), max_source_y)
    clamped = clamped_x != contract.x or clamped_y != contract.y

    desktop_x = crop_x + int(round((clamped_x * crop_w) / source_w))
    desktop_y = crop_y + int(round((clamped_y * crop_h) / source_h))

    if (
        crop_x == 0
        and crop_y == 0
        and crop_w == source_w
        and crop_h == source_h
        and not clamped
    ):
        status = "source_equals_crop"
    else:
        status = "scaled_to_desktop_clamped" if clamped else "scaled_to_desktop"

    return NormalizedCoordinates(
        x=desktop_x,
        y=desktop_y,
        status=status,
        clamped_source_x=clamped_x,
        clamped_source_y=clamped_y,
    )


def _to_size_dict(value: Optional[tuple[int, int]]) -> Optional[CoordinateSizeDict]:
    if not value:
        return None
    width, height = value
    return {"width": int(width), "height": int(height)}


def _to_crop_dict(capture_meta: Optional[CaptureMetaDict]) -> Optional[CaptureCropDict]:
    if not capture_meta:
        return None
    return {
        "x": int(capture_meta["crop_x"]),
        "y": int(capture_meta["crop_y"]),
        "width": int(capture_meta["crop_w"]),
        "height": int(capture_meta["crop_h"]),
    }


def build_contract_metadata(
    contract: CoordinateContract,
    normalized: NormalizedCoordinates,
) -> CoordinateContractDict:
    """Render contract + normalized output as metadata-safe dict."""
    capture_meta = contract.capture_meta
    source_size = (
        (int(capture_meta["source_w"]), int(capture_meta["source_h"]))
        if capture_meta
        else None
    )

    return {
        "coordinate_space": contract.coordinate_space,
        "screenshot_id": contract.screenshot_id,
        "source_coordinates": {"x": contract.x, "y": contract.y},
        "clamped_source_coordinates": {
            "x": normalized.clamped_source_x,
            "y": normalized.clamped_source_y,
        },
        "source_image_size": _to_size_dict(source_size),
        "capture_crop": _to_crop_dict(capture_meta),
        "desktop_virtual_bounds": capture_meta["desktop_virtual_bounds"] if capture_meta else None,
        "normalized_coordinates": {"x": normalized.x, "y": normalized.y},
        "normalized_space": "desktop_px",
        "normalization_status": normalized.status,
    }
