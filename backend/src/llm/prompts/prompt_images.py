"""Prompt-time image projection for artifact-backed model inputs."""

from __future__ import annotations

import base64
import binascii
import io
import re
from dataclasses import dataclass
from typing import Any, Optional

from PIL import Image, ImageOps, UnidentifiedImageError


DATA_URL_PATTERN = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$", re.DOTALL)
SUPPORTED_PRESERVE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "GIF": "image/gif",
}


@dataclass(frozen=True)
class PromptImagePolicy:
    """Limits for one provider-bound prompt image projection."""

    max_images_per_message: int
    max_image_bytes: int
    max_dimension: int


@dataclass(frozen=True)
class PromptImage:
    """Processed image ready to become an input_image/image_url part."""

    data_url: str
    byte_size: int
    mime_type: str
    width: int
    height: int


class PromptImageProjectionError(ValueError):
    """Raised when an image cannot be converted into a bounded prompt payload."""

    def __init__(
        self,
        message: str,
        *,
        check: str,
        actual_size: int,
        max_size: int,
        image_index: int,
        image_ref: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.check = check
        self.actual_size = actual_size
        self.max_size = max_size
        self.image_index = image_index
        self.image_ref = image_ref


class PromptImageProjector:
    """Decode, bound, and encode image bytes for model-visible prompt content."""

    def __init__(self, policy: PromptImagePolicy) -> None:
        self.policy = policy

    def project_base64_image(
        self,
        image_data: str,
        *,
        image_index: int,
        image_ref: Optional[str] = None,
    ) -> PromptImage:
        raw_bytes, mime_hint = self._decode_image_data(
            image_data,
            image_index=image_index,
            image_ref=image_ref,
        )
        image = self._load_image(
            raw_bytes,
            image_index=image_index,
            image_ref=image_ref,
        )
        source_format = (image.format or "").upper()
        width, height = image.size
        preserve_mime = mime_hint or FORMAT_TO_MIME.get(source_format)
        if (
            len(raw_bytes) <= self.policy.max_image_bytes
            and max(width, height) <= self.policy.max_dimension
            and source_format in SUPPORTED_PRESERVE_FORMATS
            and preserve_mime
        ):
            return self._encoded(raw_bytes, preserve_mime, width, height)

        processed = self._resize_and_compress(
            image,
            image_index=image_index,
            image_ref=image_ref,
        )
        if processed.byte_size > self.policy.max_image_bytes:
            raise PromptImageProjectionError(
                (
                    f"Prompt image {image_index + 1} is {processed.byte_size} bytes "
                    f"after preprocessing, exceeding {self.policy.max_image_bytes}"
                ),
                check="prompt_image_size",
                actual_size=processed.byte_size,
                max_size=self.policy.max_image_bytes,
                image_index=image_index,
                image_ref=image_ref,
            )
        return processed

    def _decode_image_data(
        self,
        image_data: str,
        *,
        image_index: int,
        image_ref: Optional[str],
    ) -> tuple[bytes, Optional[str]]:
        value = image_data.strip()
        mime_hint: Optional[str] = None
        match = DATA_URL_PATTERN.match(value)
        if match:
            mime_hint = match.group(1)
            value = match.group(2)
        try:
            return base64.b64decode(value, validate=True), mime_hint
        except (binascii.Error, ValueError) as exc:
            raise PromptImageProjectionError(
                f"Prompt image {image_index + 1} is not valid base64",
                check="prompt_image_decode",
                actual_size=len(value),
                max_size=self.policy.max_image_bytes,
                image_index=image_index,
                image_ref=image_ref,
            ) from exc

    def _load_image(
        self,
        raw_bytes: bytes,
        *,
        image_index: int,
        image_ref: Optional[str],
    ) -> Image.Image:
        try:
            image = Image.open(io.BytesIO(raw_bytes))
            image_format = image.format
            image.load()
            image = ImageOps.exif_transpose(image)
            image.format = image_format
            return image
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise PromptImageProjectionError(
                f"Prompt image {image_index + 1} could not be decoded",
                check="prompt_image_decode",
                actual_size=len(raw_bytes),
                max_size=self.policy.max_image_bytes,
                image_index=image_index,
                image_ref=image_ref,
            ) from exc

    def _resize_and_compress(
        self,
        image: Image.Image,
        *,
        image_index: int,
        image_ref: Optional[str],
    ) -> PromptImage:
        best: Optional[PromptImage] = None
        for side in self._candidate_sides(image):
            resized = self._resize_to_side(image, side)
            rgb = self._to_rgb(resized)
            for quality in (85, 75, 65, 55, 45):
                buffer = io.BytesIO()
                rgb.save(buffer, format="JPEG", quality=quality, optimize=True)
                image_bytes = buffer.getvalue()
                candidate = self._encoded(
                    image_bytes,
                    "image/jpeg",
                    rgb.width,
                    rgb.height,
                )
                if best is None or candidate.byte_size < best.byte_size:
                    best = candidate
                if candidate.byte_size <= self.policy.max_image_bytes:
                    return candidate

        if best is not None:
            return best
        raise PromptImageProjectionError(
            f"Prompt image {image_index + 1} could not be encoded",
            check="prompt_image_encode",
            actual_size=0,
            max_size=self.policy.max_image_bytes,
            image_index=image_index,
            image_ref=image_ref,
        )

    def _candidate_sides(self, image: Image.Image) -> list[int]:
        max_side = max(image.size)
        first_side = min(max_side, self.policy.max_dimension)
        sides = [first_side, 1536, 1280, 1024, 800, 640]
        return sorted(
            {side for side in sides if 0 < side <= self.policy.max_dimension},
            reverse=True,
        )

    @staticmethod
    def _resize_to_side(image: Image.Image, max_side: int) -> Image.Image:
        width, height = image.size
        if max(width, height) <= max_side:
            return image.copy()
        scale = max_side / float(max(width, height))
        new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
        return image.resize(new_size, Image.Resampling.LANCZOS)

    @staticmethod
    def _to_rgb(image: Image.Image) -> Image.Image:
        if image.mode in {"RGBA", "LA"} or (
            image.mode == "P" and "transparency" in image.info
        ):
            rgba = image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            background.alpha_composite(rgba)
            return background.convert("RGB")
        return image.convert("RGB")

    @staticmethod
    def _encoded(
        image_bytes: bytes,
        mime_type: str,
        width: int,
        height: int,
    ) -> PromptImage:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        return PromptImage(
            data_url=f"data:{mime_type};base64,{encoded}",
            byte_size=len(image_bytes),
            mime_type=mime_type,
            width=width,
            height=height,
        )


def policy_from_config(config: Any) -> PromptImagePolicy:
    """Resolve prompt image limits from app config security limits."""
    limits = getattr(config, "security_limits", None)
    return PromptImagePolicy(
        max_images_per_message=max(
            1,
            int(getattr(limits, "max_prompt_images_per_message", 8) or 8),
        ),
        max_image_bytes=max(
            1,
            int(getattr(limits, "max_prompt_image_bytes", 768 * 1024) or 768 * 1024),
        ),
        max_dimension=max(
            1,
            int(getattr(limits, "max_prompt_image_dimension", 2048) or 2048),
        ),
    )
