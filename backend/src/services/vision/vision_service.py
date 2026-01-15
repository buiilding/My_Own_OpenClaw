"""
Vision Service.

Manages the InternVL vision model instance for UI grounding.
Initializes the model at startup for fast first-time use.
"""
import asyncio
import logging
from typing import Optional

from backend.src.services.vision.internvl import InternVLModel, VISION_MODELS_AVAILABLE
from backend.src.services.vision.utils import normalize_model_name

logger = logging.getLogger(__name__)


class VisionService:
    """
    Service for managing the InternVL vision model.
    
    Provides a singleton instance of the InternVL model that is initialized
    at server startup, enabling fast first-time use in mouse_control tool with find_coordinates_by="prediction".
    """

    def __init__(self, model_name: Optional[str] = None):
        """
        Initialize the vision service.
        
        Args:
            model_name: Optional model name (defaults to "OpenGVLab/InternVL3_5-4B")
        """
        self.model_name = normalize_model_name(model_name)
        self._model: Optional[InternVLModel] = None
        self._initialized = False
        self._initialization_error: Optional[str] = None

    async def initialize(self) -> bool:
        """
        Initialize the InternVL model.
        
        This should be called during server startup to pre-load the model.
        
        Returns:
            True if initialization successful, False otherwise
        """
        if self._initialized:
            return True

        if not VISION_MODELS_AVAILABLE:
            self._initialization_error = "Vision model dependencies not available"
            logger.warning(self._initialization_error)
            return False

        try:
            logger.info(f"Initializing vision service with model: {self.model_name}")
            
            # Initialize InternVL model in thread pool to avoid blocking event loop
            # Model loading is synchronous and CPU/IO intensive
            loop = asyncio.get_event_loop()
            self._model = await loop.run_in_executor(
                None,
                lambda: InternVLModel(
                    model_name=self.model_name, device="auto", trust_remote_code=True
                )
            )
            
            self._initialized = True
            logger.info(f"Vision service initialized successfully with model: {self.model_name}")
            return True

        except Exception as e:
            self._initialization_error = str(e)
            logger.error(f"Failed to initialize vision service: {e}", exc_info=True)
            return False

    @property
    def model(self) -> Optional[InternVLModel]:
        """
        Get the initialized InternVL model instance.
        
        Returns:
            InternVLModel instance if initialized, None otherwise
        """
        return self._model

    @property
    def is_initialized(self) -> bool:
        """Check if the vision service is initialized."""
        return self._initialized

    @property
    def initialization_error(self) -> Optional[str]:
        """Get the initialization error message if initialization failed."""
        return self._initialization_error

