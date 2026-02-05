"""
UI-Venus Vision Model Provider.

Provides a Qwen2.5-VL-based model for vision-language tasks like UI grounding.
Shares the same base initialization contract as InternVLModel but omits the
InternVL-specific `use_flash_attn` argument that Venus models do not support.
"""

import logging

from backend.src.services.vision.providers.base import VISION_MODELS_AVAILABLE
from backend.src.services.vision.providers.internvl import InternVLModel

logger = logging.getLogger(__name__)

# Import dependencies - these are module-level in base.py but not exported
if VISION_MODELS_AVAILABLE:
    import torch
    from transformers import AutoModel, AutoTokenizer
else:
    torch = None
    AutoModel = None
    AutoTokenizer = None


class VenusVisionModel(InternVLModel):
    """
    Vision model handler for inclusionAI/UI-Venus-Ground-7B (Qwen2.5-VL family).

    IMPORTANT:
    - Behavior outside of model/tokenizer loading (pre/post-processing,
      coordinate extraction) is shared with InternVLModel via inheritance.
      This class focuses solely on safe model construction for Venus-style
      architectures that do NOT accept `use_flash_attn`.
    """

    def _load(self):
        """Load the Venus/Qwen2.5-VL model and tokenizer without use_flash_attn."""
        if not VISION_MODELS_AVAILABLE or AutoModel is None or AutoTokenizer is None:
            raise ImportError("Vision model dependencies not available")

        try:
            logger.info(
                f"Loading Venus vision model (Qwen2.5-VL family): {self.model_name}"
            )

            # Try device_map with auto device placement first (no use_flash_attn kwarg)
            try:
                model_dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
                self.model = AutoModel.from_pretrained(
                    self.model_name,
                    dtype=model_dtype,
                    low_cpu_mem_usage=True,
                    device_map="auto",
                    trust_remote_code=self.trust_remote_code,
                ).eval()
                self._model_dtype = model_dtype
                logger.info(
                    f"Loaded Venus model with device_map: {self.model_name} "
                    f"on {self.model.device} with dtype {model_dtype}"
                )
            except Exception as device_map_error:
                logger.warning(
                    f"Venus device_map loading failed ({device_map_error}), "
                    "trying direct loading without device_map"
                )

                # Direct loading - prefer CUDA but allow CPU fallback
                device = "cuda" if torch.cuda.is_available() else "cpu"
                dtype = torch.float16 if device == "cuda" else torch.float32

                try:
                    self.model = (
                        AutoModel.from_pretrained(
                            self.model_name,
                            dtype=dtype,
                            low_cpu_mem_usage=True,
                            trust_remote_code=self.trust_remote_code,
                        )
                        .to(device)
                        .eval()
                    )
                    self._model_dtype = dtype
                    logger.info(
                        f"Loaded Venus model on {device} with {dtype}: {self.model_name}"
                    )
                except Exception as direct_error:
                    logger.warning(
                        f"Venus direct loading failed ({direct_error}), "
                        "trying CPU-only fallback"
                    )

                    # CPU fallback as last resort
                    try:
                        cpu_dtype = torch.float32
                        self.model = (
                            AutoModel.from_pretrained(
                                self.model_name,
                                dtype=cpu_dtype,
                                low_cpu_mem_usage=True,
                                trust_remote_code=self.trust_remote_code,
                            )
                            .to("cpu")
                            .eval()
                        )
                        self._model_dtype = cpu_dtype
                        logger.info(
                            f"Loaded Venus model on CPU (fallback): {self.model_name} "
                            f"with dtype {cpu_dtype}"
                        )
                    except Exception as cpu_error:
                        logger.error(
                            "All Venus loading methods failed: "
                            f"device_map={device_map_error}, direct={direct_error}, cpu={cpu_error}"
                        )
                        raise RuntimeError(f"Failed to load Venus vision model: {cpu_error}")

            # Load tokenizer (Venus models also require trust_remote_code=True)
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                trust_remote_code=self.trust_remote_code,
                use_fast=False,
            )
            logger.info(f"Successfully loaded Venus model: {self.model_name}")

        except Exception as e:
            logger.error(f"Failed to load Venus vision model {self.model_name}: {e}")
            raise
