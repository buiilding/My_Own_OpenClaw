"""Vision provider interface."""

from typing import Any, Optional, Protocol


class IVisionProvider(Protocol):
    """Provider contract for vision inference backends."""

    provider_id: str
    model_id: str
    model_name: str

    @property
    def model(self) -> Optional[Any]:
        """Get the initialized vision model instance."""
        ...

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


# Backward-compatible alias while the rest of the backend migrates off service naming.
IVisionService = IVisionProvider
