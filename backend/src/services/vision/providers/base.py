"""
Base Vision Model Provider.

Provides the base class and shared dependencies for all vision-language models.
"""
import asyncio
import logging
from typing import Any, Callable, Tuple

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


def resolve_model_device(model: Any) -> Any:
    """
    Resolve a model device defensively.

    Some model wrappers (e.g., sharded/accelerate-dispatched models) may not
    expose a `.device` attribute. In that case, inspect first parameter device
    and fall back to CPU.
    """
    device = getattr(model, "device", None)
    if device is not None:
        return device

    parameters = getattr(model, "parameters", None)
    if callable(parameters):
        try:
            first_param = next(parameters())
            param_device = getattr(first_param, "device", None)
            if param_device is not None:
                return param_device
        except (StopIteration, TypeError):
            pass

    return "cpu"


def load_model_with_fallbacks(
    *,
    provider_label: str,
    model_name: str,
    torch_module: Any,
    device_map_dtype: Any,
    load_device_map_model: Callable[[Any], Any],
    load_direct_model: Callable[[Any, str], Any],
    logger_instance: logging.Logger,
    direct_retry_message: str,
    cpu_retry_message: str,
    failure_message: str,
) -> Tuple[Any, Any]:
    """
    Load a vision model with a shared device_map -> direct -> CPU fallback sequence.

    Returns:
        A tuple of (model, dtype_used).
    """
    device_map_error = None
    direct_error = None

    try:
        model = load_device_map_model(device_map_dtype)
        return model, device_map_dtype
    except Exception as error:
        device_map_error = error
        logger_instance.warning(
            f"{provider_label} device_map loading failed for {model_name} "
            f"({device_map_error}), "
            f"{direct_retry_message}"
        )

    device = "cuda" if torch_module.cuda.is_available() else "cpu"
    direct_dtype = torch_module.float16 if device == "cuda" else torch_module.float32
    try:
        model = load_direct_model(direct_dtype, device)
        return model, direct_dtype
    except Exception as error:
        direct_error = error
        logger_instance.warning(
            f"{provider_label} direct loading failed for {model_name} "
            f"({direct_error}), "
            f"{cpu_retry_message}"
        )

    cpu_dtype = torch_module.float32
    try:
        model = load_direct_model(cpu_dtype, "cpu")
        return model, cpu_dtype
    except Exception as cpu_error:
        logger_instance.error(
            f"All {provider_label} loading methods failed for {model_name}: "
            f"device_map={device_map_error}, direct={direct_error}, cpu={cpu_error}"
        )
        raise RuntimeError(f"{failure_message}: {cpu_error}") from cpu_error
