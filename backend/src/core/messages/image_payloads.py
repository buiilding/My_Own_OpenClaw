"""Provider-facing image payload normalization helpers."""

from __future__ import annotations

import base64
import re
from typing import Optional

DATA_IMAGE_URL_RE = re.compile(
    r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$",
    re.DOTALL,
)


def detect_image_mime_type(image_bytes: bytes) -> Optional[str]:
    """Return the image MIME type indicated by well-known file signatures."""
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if image_bytes.startswith(b"GIF87a") or image_bytes.startswith(b"GIF89a"):
        return "image/gif"
    if (
        len(image_bytes) >= 12
        and image_bytes.startswith(b"RIFF")
        and image_bytes[8:12] == b"WEBP"
    ):
        return "image/webp"
    return None


def normalize_provider_image_data_url(
    image_data: str,
    *,
    content_type: object = None,
) -> Optional[str]:
    """
    Return a provider-facing image data URL with MIME matching actual bytes.

    Bare base64 values are accepted only when the byte signature identifies a
    supported image type, or when a valid image content type is supplied. Existing
    data URLs keep their base64 payload but have the MIME repaired when the bytes
    identify a different image type.
    """
    if not isinstance(image_data, str):
        return None
    value = image_data.strip()
    if not value:
        return None

    supplied_mime = (
        content_type.strip().lower()
        if isinstance(content_type, str) and content_type.strip().startswith("image/")
        else None
    )
    encoded = value
    data_url_mime: Optional[str] = None
    match = DATA_IMAGE_URL_RE.match(value)
    if match:
        data_url_mime = match.group(1).lower()
        encoded = match.group(2)
        supplied_mime = supplied_mime or data_url_mime
    elif value.startswith("data:"):
        return None

    encoded = "".join(encoded.split())
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except Exception:
        return value if data_url_mime else None

    detected_mime = detect_image_mime_type(image_bytes)
    mime_type = detected_mime or supplied_mime
    if not mime_type:
        return None
    return f"data:{mime_type};base64,{encoded}"
