"""
Base Vision Model Provider.

Provides the base class and shared dependencies for all vision-language models.
"""
import asyncio
import logging

logger = logging.getLogger(__name__)

VISION_MODELS_AVAILABLE = False
try:
    import torch
    from transformers import AutoModel, AutoTokenizer

    VISION_MODELS_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Vision model dependencies not available: {e}")
    torch = None
    AutoModel = None
    AutoTokenizer = None


class BaseVisionModel:
    """
    Base class for vision-language models used for UI grounding.

    SHARED RESPONSIBILITIES:
    - Store model_name/device/tokenizer
    - Manage a serialization lock for inference
    - Call subclass-specific _load() during initialization

    Subclasses MUST implement `_load()` to construct `self.model` and
    `self.tokenizer`. All other behavior (pre/post-processing, coordinate
    extraction) can be implemented in subclasses or via mixins.
    """

    def __init__(
        self, model_name: str, device: str = "auto", trust_remote_code: bool = True
    ):
        if not VISION_MODELS_AVAILABLE:
            raise ImportError("Vision model dependencies not available")

        self.model_name = model_name
        self.device = device
        self.model = None
        self.tokenizer = None
        self.trust_remote_code = trust_remote_code
        self._model_dtype = None  # Store model dtype for tensor casting
        # Serialize inference requests across all subclasses to avoid GPU thrash
        self._inference_lock = asyncio.Lock()
        # Delegate model/tokenizer construction to subclass implementation
        self._load()

    def _load(self):
        """Subclasses must implement model/tokenizer loading."""
        raise NotImplementedError("Subclasses must implement _load()")
