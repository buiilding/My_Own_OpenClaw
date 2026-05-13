"""OCR provider interface."""

from typing import Any, Optional, Protocol


class IOcrProvider(Protocol):
    """Provider contract for OCR inference backends."""

    provider_id: str
    model_id: str
    enabled: bool

    @property
    def is_ready(self) -> bool:
        """Return whether the provider is ready to serve OCR requests."""
        ...

    async def initialize(self) -> None:
        """Warm the provider if startup initialization is supported."""
        ...

    async def health_check(self) -> bool:
        """Return provider health using a cheap readiness probe when available."""
        ...

    async def analyze_image(self, image_base64: str) -> Optional[list[dict[str, Any]]]:
        """Run OCR on one image and return normalized rows."""
        ...
