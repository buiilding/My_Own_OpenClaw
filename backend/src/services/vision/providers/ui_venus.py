"""
UI-Venus Vision Model Provider.

Provides a Qwen2.5-VL-based model for vision-language tasks like UI grounding.
Shares the same base initialization contract as InternVLModel but omits the
InternVL-specific `use_flash_attn` argument that Venus models do not support.
"""

import asyncio
import base64
import logging
from io import BytesIO
from typing import Optional, Tuple

from PIL import Image

from backend.src.services.vision.coordinates import (
    extract_point_or_bbox_center,
    scale_model_point_to_pixels,
)
from backend.src.services.vision.providers.base import (
    VISION_MODELS_AVAILABLE,
    load_model_with_fallbacks,
    resolve_model_device,
)
from backend.src.services.vision.providers.internvl import InternVLModel

logger = logging.getLogger(__name__)

# Import dependencies - these are module-level in base.py but not exported
if VISION_MODELS_AVAILABLE:
    import torch
    from transformers import AutoModel, AutoTokenizer, AutoProcessor
    try:
        from transformers import AutoModelForVision2Seq
    except ImportError:  # pragma: no cover - older transformers
        AutoModelForVision2Seq = None
else:
    torch = None
    AutoModel = None
    AutoTokenizer = None
    AutoProcessor = None
    AutoModelForVision2Seq = None


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

            if AutoProcessor is None:
                raise ImportError("AutoProcessor not available for Venus vision model")
            self.model, self._model_dtype = load_model_with_fallbacks(
                provider_label="Venus",
                model_name=self.model_name,
                torch_module=torch,
                device_map_dtype=(
                    torch.bfloat16 if torch.cuda.is_available() else torch.float32
                ),
                load_device_map_model=self._load_with_device_map,
                load_direct_model=self._load_direct,
                logger_instance=logger,
                direct_retry_message="trying direct loading without device_map",
                cpu_retry_message="trying CPU-only fallback",
                failure_message="Failed to load Venus vision model",
            )
            model_device = resolve_model_device(self.model)
            logger.info(
                f"Loaded Venus model: {self.model_name} on {model_device} "
                f"with dtype {self._model_dtype}"
            )

            # Load processor (handles both vision + text)
            self.processor = AutoProcessor.from_pretrained(
                self.model_name,
                trust_remote_code=self.trust_remote_code,
            )
            # Keep tokenizer for compatibility when available
            self.tokenizer = getattr(self.processor, "tokenizer", None)
            logger.info(f"Successfully loaded Venus model: {self.model_name}")

        except Exception as e:
            logger.error(f"Failed to load Venus vision model {self.model_name}: {e}")
            raise

    def _load_with_device_map(self, dtype):
        if AutoModelForVision2Seq is None:
            raise RuntimeError("AutoModelForVision2Seq unavailable")
        return AutoModelForVision2Seq.from_pretrained(
            self.model_name,
            dtype=dtype,
            low_cpu_mem_usage=True,
            device_map="auto",
            trust_remote_code=self.trust_remote_code,
        ).eval()

    def _load_direct(self, dtype, device: str):
        if AutoModelForVision2Seq is None:
            raise RuntimeError("AutoModelForVision2Seq unavailable")
        return (
            AutoModelForVision2Seq.from_pretrained(
                self.model_name,
                dtype=dtype,
                low_cpu_mem_usage=True,
                trust_remote_code=self.trust_remote_code,
            )
            .to(device)
            .eval()
        )

    async def predict_click_coordinates(
        self, image_b64: str, instruction: str
    ) -> Optional[Tuple[int, int]]:
        """Predict click coordinates using Qwen2.5-VL with processor + generate."""
        async with self._inference_lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                None,
                self._predict_sync,
                image_b64,
                instruction
            )

    def _predict_sync(
        self, image_b64: str, instruction: str
    ) -> Optional[Tuple[int, int]]:
        import time

        vision_prediction_start = time.perf_counter()
        if not instruction:
            raise ValueError("description parameter is required for prediction method")
        if not getattr(self, "processor", None):
            raise RuntimeError("Vision processor not initialized for Venus model")

        try:
            img_bytes = base64.b64decode(image_b64)
            image = Image.open(BytesIO(img_bytes))
            width, height = image.size

            grounding_prompt = (
                f"Please provide the bounding box coordinate of the UI element this user instruction describes: <ref>{instruction}</ref>. "
                f"Answer in the format of [[x1, y1, x2, y2]]"
            )

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": grounding_prompt},
                    ],
                }
            ]

            text = self.processor.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
            inputs = self.processor(
                text=[text],
                images=[image],
                return_tensors="pt",
            )
            inputs = inputs.to(resolve_model_device(self.model))

            with torch.no_grad():
                output_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=256,
                    do_sample=False,
                    temperature=0.0,
                    use_cache=True,
                )

            output_text = self.processor.batch_decode(
                output_ids, skip_special_tokens=True
            )[0]

            if not output_text:
                logger.error("Empty output from Venus model")
                return None

            point = extract_point_or_bbox_center(output_text)
            if point is None:
                logger.error(f"Could not parse coordinates from output: {output_text}")
                return None

            x_px, y_px = scale_model_point_to_pixels(
                point[0], point[1], width, height
            )

            vision_prediction_time = time.perf_counter() - vision_prediction_start
            logger.info(
                f"[Timing] Venus vision prediction completed in {vision_prediction_time:.3f}s (coordinates=({x_px}, {y_px}))"
            )
            return (x_px, y_px)

        except Exception as e:
            vision_prediction_time = time.perf_counter() - vision_prediction_start
            logger.error(
                f"[Timing] Venus vision prediction failed after {vision_prediction_time:.3f}s: {e}"
            )
            return None
