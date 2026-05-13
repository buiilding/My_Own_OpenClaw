"""Vision provider interface."""

from typing import Optional, Protocol


class IVisionProvider(Protocol):
    """Provider contract for vision inference backends."""

    provider_id: str
    model_id: str
    model_name: str

    @property
    def is_initialized(self) -> bool:
        """Check if the vision service is initialized."""
        ...

    @property
    def initialization_error(self) -> Optional[str]:
        """Get the initialization error message if initialization failed."""
        ...

    async def initialize(self) -> bool:
        """Initialize the InternVL model."""
        ...

    async def health_check(self) -> bool:
        """Return provider health using a cheap readiness probe when available."""
        ...

    async def predict_coordinates(
        self,
        image_base64: str,
        description: str,
    ) -> Optional[tuple[int, int]]:
        """Locate an element in the image and return its click point."""
        ...

    async def answer_question_about_image(
        self,
        image_base64: str,
        prompt: str,
    ) -> Optional[str]:
        """Answer a descriptive prompt about the image."""
        ...


# Backward-compatible alias while the rest of the backend migrates off service naming.
IVisionService = IVisionProvider
