"""
Vision Service.

Manages the InternVL vision model instance for UI grounding.
Initializes the model at startup for fast first-time use.
"""
import asyncio
import logging
from typing import Optional

from backend.src.services.vision.providers import (
    BaseVisionModel,
    InternVLModel,
    VenusVisionModel,
    VISION_MODELS_AVAILABLE,
)
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
        self._model: Optional[BaseVisionModel] = None
        self._initialized = False
        self._initialization_error: Optional[str] = None
        # RACE CONDITION FIX: Lock to serialize initialization/unload operations
        # Prevents double initialization (double VRAM usage) and init/unload conflicts
        self._lock = asyncio.Lock()

    def _build_model_instance(self) -> BaseVisionModel:
        """Build concrete vision model implementation from configured model name."""
        if self.model_name.startswith("inclusionAI/UI-Venus"):
            return VenusVisionModel(
                model_name=self.model_name,
                device="auto",
                trust_remote_code=True,
            )
        return InternVLModel(
            model_name=self.model_name,
            device="auto",
            trust_remote_code=True,
        )

    @staticmethod
    def _clear_cuda_cache_if_available() -> None:
        """Clear PyTorch CUDA cache when available."""
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info("CUDA cache cleared")
        except ImportError:
            logger.debug("PyTorch not available; skipping CUDA cache clear")

    async def initialize(self) -> bool:
        """
        Initialize the InternVL model.
        
        This should be called during server startup to pre-load the model.
        Thread-safe: Uses lock to prevent concurrent initialization (double VRAM usage).
        
        Returns:
            True if initialization successful, False otherwise
        """
        # RACE CONDITION FIX: Acquire lock to serialize initialization
        async with self._lock:
            # Double-check after acquiring lock (another coroutine may have initialized)
            if self._initialized:
                return True

            if not VISION_MODELS_AVAILABLE:
                self._initialization_error = "Vision model dependencies not available"
                logger.warning(self._initialization_error)
                return False

            try:
                logger.info(f"Initializing vision service with model: {self.model_name}")

                # Initialize model in thread pool to avoid blocking event loop
                # Model loading is synchronous and CPU/IO intensive
                loop = asyncio.get_running_loop()
                self._model = await loop.run_in_executor(None, self._build_model_instance)
                
                self._initialized = True
                logger.info(f"Vision service initialized successfully with model: {self.model_name}")
                return True

            except Exception as e:
                self._initialization_error = str(e)
                self._model = None
                self._initialized = False
                logger.error(f"Failed to initialize vision service: {e}", exc_info=True)
                return False

    @property
    def model(self) -> Optional[BaseVisionModel]:
        """
        Get the initialized vision model instance.
        
        Returns:
            Vision model instance if initialized, None otherwise
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

    async def unload_model(self) -> bool:
        """
        Unload the InternVL model to free VRAM/system RAM.
        
        This is useful when the vision system is not actively being used,
        allowing other applications or models to use the freed memory.
        Thread-safe: Uses lock to prevent conflicts with concurrent initialization.
        
        Returns:
            True if model was unloaded, False if no model was loaded
        """
        # RACE CONDITION FIX: Acquire lock to serialize with initialization
        async with self._lock:
            # Double-check after acquiring lock (initialization may have completed)
            if not self._initialized or self._model is None:
                return False
            
            try:
                logger.info(f"Unloading vision model: {self.model_name}")
                
                # Delete model reference and trigger garbage collection
                # PyTorch will free GPU memory when the model object is deleted
                self._model = None
                self._initialized = False
                
                # Force garbage collection to free memory immediately
                import gc
                gc.collect()
                
                # If CUDA is available, empty cache to free GPU memory
                self._clear_cuda_cache_if_available()
                
                logger.info(f"Vision model unloaded successfully: {self.model_name}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to unload vision model: {e}", exc_info=True)
                return False
