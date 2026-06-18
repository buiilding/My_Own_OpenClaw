"""InternVL vision model provider."""

import asyncio
import base64
import importlib
import logging
from io import BytesIO
from typing import Any, Optional, Tuple

from PIL import Image

from backend.src.services.vision.coordinates import (
    extract_point_or_bbox_center,
    scale_norm_to_pixels,
)
from backend.src.services.vision.providers.base import (
    VISION_MODELS_AVAILABLE,
    BaseVisionModel,
    load_model_with_fallbacks,
    resolve_model_device,
)
from backend.src.services.vision.providers.internvl_runtime_helpers import (
    build_grounding_prompt,
    build_instruction_log_metadata,
    build_response_log_metadata,
    disable_flash_attention_runtime,
    is_cuda_kernel_image_error,
    is_meta_tensor_loading_error,
    log_failure_context,
    log_vision_response_metadata,
    prepare_question,
    resolve_model_dtype,
    run_chat_generation,
    run_chat_with_fallbacks,
    run_generate_fallback,
    run_generate_fallback_with_chat_error,
)

logger = logging.getLogger(__name__)

# Image normalization constants.
INTERNVL_MEAN = (0.485, 0.456, 0.406)
INTERNVL_STD = (0.229, 0.224, 0.225)

# Import InternVL-specific dependencies
if VISION_MODELS_AVAILABLE:
    importlib.import_module("einops")  # Required for InternVL model operations
    importlib.import_module("timm")  # Required for InternVL vision components
    import torch
    import torchvision.transforms as T
    from torchvision.transforms.functional import InterpolationMode
    from transformers import AutoModel, AutoTokenizer
else:
    torch = None
    T = None
    InterpolationMode = None
    AutoModel = None
    AutoTokenizer = None


class InternVLModel(BaseVisionModel):
    """
    Generic Hugging Face vision-language model handler for InternVL models.
    Based on CoAct-1's implementation and adapted for WindieOS screen grounding.
    """

    def _load(self):
        """Load the InternVL model and tokenizer."""
        try:
            # Check if flash-attn is available
            try:
                importlib.import_module("flash_attn")
                use_flash_attn = True
                logger.info("FlashAttention2 is available")
            except ImportError:
                use_flash_attn = False
                logger.warning(
                    "FlashAttention2 not available, using standard attention"
                )

            # Try CUDA first, fallback to CPU if needed (similar to Coact-1 approach)
            logger.info("Loading InternVL model (CUDA preferred, CPU fallback)")
            self.model, self._model_dtype = load_model_with_fallbacks(
                provider_label="InternVL",
                model_name=self.model_name,
                torch_module=torch,
                device_map_dtype=torch.bfloat16,
                load_device_map_model=lambda dtype: self._load_model(
                    dtype=dtype,
                    use_flash_attn=use_flash_attn,
                    device_map="auto",
                ),
                load_direct_model=lambda dtype, device: self._load_model(
                    dtype=dtype,
                    use_flash_attn=False,
                    device=device,
                ),
                logger_instance=logger,
                direct_retry_message="trying direct loading",
                cpu_retry_message="trying CPU fallback",
                failure_message="Failed to load vision model",
            )
            model_device = resolve_model_device(self.model)
            logger.info(
                f"Loaded InternVL model: {self.model_name} on {model_device} "
                f"with dtype {self._model_dtype}"
            )

            # Load tokenizer (InternVL requires trust_remote_code=True and often use_fast=False)
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                trust_remote_code=self.trust_remote_code,
                use_fast=False,
            )
            logger.info(f"Successfully loaded InternVL model: {self.model_name}")
        except Exception as e:
            logger.error(f"Failed to load InternVL model {self.model_name}: {e}")
            raise

    # ---- Image preprocessing utilities adapted from CoAct-1 InternVL implementation ----

    def _load_model(
        self,
        *,
        dtype,
        use_flash_attn: bool,
        device_map: Optional[str] = None,
        device: Optional[str] = None,
    ):
        kwargs = {
            "dtype": dtype,
            "low_cpu_mem_usage": True,
            "use_flash_attn": use_flash_attn,
            "trust_remote_code": self.trust_remote_code,
        }
        if device_map is not None:
            kwargs["device_map"] = device_map

        try:
            model = AutoModel.from_pretrained(self.model_name, **kwargs)
        except Exception as error:
            if is_meta_tensor_loading_error(error) and kwargs.get("low_cpu_mem_usage"):
                retry_kwargs = dict(kwargs)
                retry_kwargs["low_cpu_mem_usage"] = False
                logger.warning(
                    "InternVL load hit meta-tensor init path for %s; retrying with low_cpu_mem_usage=False",
                    self.model_name,
                )
                model = AutoModel.from_pretrained(self.model_name, **retry_kwargs)
            else:
                raise
        if device is not None:
            model = model.to(device)
        return model.eval()

    def _build_transform(self, input_size: int):
        """Build image transformation pipeline."""
        if not VISION_MODELS_AVAILABLE or T is None:
            raise ImportError("Vision model dependencies not available")

        transform = T.Compose(
            [
                T.Lambda(lambda img: img.convert("RGB") if img.mode != "RGB" else img),
                T.Resize(
                    (input_size, input_size), interpolation=InterpolationMode.BICUBIC
                ),
                T.ToTensor(),
                T.Normalize(mean=INTERNVL_MEAN, std=INTERNVL_STD),
            ]
        )
        return transform

    def _dynamic_preprocess(
        self,
        image: Image.Image,
        min_num: int = 1,
        max_num: int = 12,
        image_size: int = 448,
        use_thumbnail: bool = True,
    ):
        """Dynamically preprocess image into patches (from CoAct-1)."""
        orig_width, orig_height = image.size
        aspect_ratio = orig_width / orig_height

        # Generate possible aspect ratios
        target_ratios = set(
            (i, j)
            for n in range(min_num, max_num + 1)
            for i in range(1, n + 1)
            for j in range(1, n + 1)
            if i * j <= max_num and i * j >= min_num
        )
        target_ratios = sorted(target_ratios, key=lambda x: x[0] * x[1])

        # Find best aspect ratio
        best_ratio_diff = float("inf")
        best_ratio = (1, 1)
        area = orig_width * orig_height
        for ratio in target_ratios:
            target_aspect_ratio = ratio[0] / ratio[1]
            ratio_diff = abs(aspect_ratio - target_aspect_ratio)
            if ratio_diff < best_ratio_diff:
                best_ratio_diff = ratio_diff
                best_ratio = ratio
            elif ratio_diff == best_ratio_diff:
                if area > 0.5 * image_size * image_size * ratio[0] * ratio[1]:
                    best_ratio = ratio

        target_width = image_size * best_ratio[0]
        target_height = image_size * best_ratio[1]
        blocks = best_ratio[0] * best_ratio[1]

        resized_img = image.resize((target_width, target_height))
        processed_images = []
        for i in range(blocks):
            box = (
                (i % (target_width // image_size)) * image_size,
                (i // (target_width // image_size)) * image_size,
                ((i % (target_width // image_size)) + 1) * image_size,
                ((i // (target_width // image_size)) + 1) * image_size,
            )
            split_img = resized_img.crop(box)
            processed_images.append(split_img)

        if use_thumbnail and len(processed_images) != 1:
            thumbnail_img = image.resize((image_size, image_size))
            processed_images.append(thumbnail_img)

        return processed_images

    def _images_to_pixel_values(self, images, input_size: int = 448, max_num: int = 12):
        """Convert images to pixel values (from CoAct-1)."""
        transform = self._build_transform(input_size=input_size)
        pixel_values_list = []
        num_patches_list = []

        for img in images:
            tiles = self._dynamic_preprocess(
                img, image_size=input_size, use_thumbnail=True, max_num=max_num
            )
            pv = [transform(tile) for tile in tiles]
            pv = torch.stack(pv)
            num_patches_list.append(pv.shape[0])
            pixel_values_list.append(pv)

        if not pixel_values_list:
            return None, []

        pixel_values = torch.cat(pixel_values_list)
        return pixel_values, num_patches_list

    async def predict_click_coordinates(
        self, image_b64: str, instruction: str
    ) -> Optional[Tuple[int, int]]:
        """
        Predict click coordinates using the InternVL model.
        Based on CoAct-1's InternVL grounding implementation.

        PERFORMANCE: Offloads blocking CPU/GPU operations to thread pool to prevent
        event loop blocking. All synchronous operations (image decoding, PIL processing,
        model inference) are executed in a separate thread.

        CONCURRENCY: Uses lock to serialize inference requests, preventing race conditions
        when multiple concurrent requests access the shared model instance.
        """
        async with self._inference_lock:
            loop = asyncio.get_running_loop()
            # Offload the synchronous, blocking work to a thread pool
            return await loop.run_in_executor(
                None, self._predict_sync, image_b64, instruction
            )

    async def answer_question_about_image(
        self,
        image_b64: str,
        prompt: str,
    ) -> Optional[str]:
        """Answer a generic prompt about an image."""
        async with self._inference_lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                None,
                self._answer_sync,
                image_b64,
                prompt,
            )

    def _predict_sync(
        self, image_b64: str, instruction: str
    ) -> Optional[Tuple[int, int]]:
        """
        Synchronous implementation of prediction logic.

        This method contains all blocking operations (base64 decoding, PIL processing,
        model inference) that must run off the event loop.
        """
        import time

        vision_prediction_start = time.perf_counter()
        width: Optional[int] = None
        height: Optional[int] = None
        model_device: Optional[Any] = None
        try:
            instruction_preview, instruction_hash = build_instruction_log_metadata(
                instruction
            )
            preview_suffix = (
                "..." if len(instruction_preview) < len(instruction) else ""
            )
            model_device = resolve_model_device(self.model)
            logger.info(
                f"Starting InternVL prediction for instruction (preview: {instruction_preview}{preview_suffix}, hash: {instruction_hash})"
            )
            logger.info(
                f"Model device: {model_device}, CUDA available: {torch.cuda.is_available()}"
            )

            img_bytes = base64.b64decode(image_b64)
            image = Image.open(BytesIO(img_bytes))
            width, height = image.size
            logger.info(f"Image decoded: {width}x{height}, mode: {image.mode}")

            question = prepare_question(
                instruction,
                build_grounding_prompt_fn=build_grounding_prompt,
            )
            logger.debug("Grounding prompt prepared (instruction sanitized in logs)")
            logger.debug(
                "Prepared chat question with image placeholder (instruction hash=%s)",
                instruction_hash,
            )

            pixel_values, num_patches_list = self._images_to_pixel_values(
                [image], input_size=448, max_num=12
            )
            logger.info(
                f"Image processed to pixel values: {pixel_values.shape if pixel_values is not None else None}, num_patches: {num_patches_list}"
            )
            if pixel_values is None:
                logger.error("Failed to process image into pixel values")
                return None

            model_dtype = resolve_model_dtype(
                cached_dtype=self._model_dtype,
                model=getattr(self, "model", None),
                torch_module=torch,
                logger_instance=logger,
            )
            pixel_values = pixel_values.to(model_dtype).to(model_device)

            generation_config = {
                "max_new_tokens": 256,
                "do_sample": False,
                "temperature": 0.0,
            }
            logger.info("Starting InternVL chat generation...")
            output_text = run_chat_with_fallbacks(
                run_chat_generation_fn=lambda **kwargs: run_chat_generation(
                    model=self.model,
                    tokenizer=self.tokenizer,
                    logger_instance=logger,
                    **kwargs,
                ),
                disable_flash_attention_runtime_fn=lambda: disable_flash_attention_runtime(
                    model=self.model,
                    logger_instance=logger,
                ),
                run_generate_fallback_with_chat_error_fn=lambda **kwargs: run_generate_fallback_with_chat_error(
                    run_generate_fallback_fn=lambda **fallback_kwargs: run_generate_fallback(
                        model=self.model,
                        tokenizer=self.tokenizer,
                        torch_module=torch,
                        logger_instance=logger,
                        **fallback_kwargs,
                    ),
                    logger_instance=logger,
                    **kwargs,
                ),
                is_cuda_kernel_image_error_fn=is_cuda_kernel_image_error,
                pixel_values=pixel_values,
                question=question,
                num_patches_list=num_patches_list,
                generation_config=generation_config,
                model_device=model_device,
                logger_instance=logger,
            )

            if not output_text:
                logger.error("Empty output from model")
                return None
            log_vision_response_metadata(
                logger,
                "InternVL prediction response",
                output_text,
            )

            point = extract_point_or_bbox_center(output_text)
            logger.info(f"Extracted point: {point}")
            if point is None:
                response_length, response_hash = build_response_log_metadata(
                    output_text
                )
                logger.error(
                    "Could not parse InternVL coordinates from model response "
                    "(length=%d, sha256=%s)",
                    response_length,
                    response_hash,
                )
                return None

            x_norm, y_norm = point
            x_px, y_px = scale_norm_to_pixels(x_norm, y_norm, width, height)
            vision_prediction_time = time.perf_counter() - vision_prediction_start
            logger.info(
                f"[Timing] Vision model prediction completed in {vision_prediction_time:.3f}s (coordinates=({x_px}, {y_px}))"
            )
            logger.info(f"Final pixel coordinates: ({x_px}, {y_px})")
            return (x_px, y_px)

        except Exception as error:
            vision_prediction_time = time.perf_counter() - vision_prediction_start
            log_failure_context(
                error=error,
                elapsed_seconds=vision_prediction_time,
                width=width,
                height=height,
                model_device=model_device,
                model=self.model,
                torch_module=torch,
                resolve_model_device_fn=resolve_model_device,
                logger_instance=logger,
            )
            return None

    def _answer_sync(
        self,
        image_b64: str,
        prompt: str,
    ) -> Optional[str]:
        """Synchronous image-question answering path for direct SDK APIs."""
        if not prompt:
            raise ValueError("prompt is required")

        width: Optional[int] = None
        height: Optional[int] = None
        model_device: Optional[Any] = None
        try:
            model_device = resolve_model_device(self.model)
            img_bytes = base64.b64decode(image_b64)
            image = Image.open(BytesIO(img_bytes))
            width, height = image.size

            pixel_values, num_patches_list = self._images_to_pixel_values(
                [image], input_size=448, max_num=12
            )
            if pixel_values is None:
                return None

            model_dtype = resolve_model_dtype(
                cached_dtype=self._model_dtype,
                model=getattr(self, "model", None),
                torch_module=torch,
                logger_instance=logger,
            )
            pixel_values = pixel_values.to(model_dtype).to(model_device)
            generation_config = {
                "max_new_tokens": 256,
                "do_sample": False,
                "temperature": 0.0,
            }
            output_text = run_chat_with_fallbacks(
                run_chat_generation_fn=lambda **kwargs: run_chat_generation(
                    model=self.model,
                    tokenizer=self.tokenizer,
                    logger_instance=logger,
                    **kwargs,
                ),
                disable_flash_attention_runtime_fn=lambda: disable_flash_attention_runtime(
                    model=self.model,
                    logger_instance=logger,
                ),
                run_generate_fallback_with_chat_error_fn=lambda **kwargs: run_generate_fallback_with_chat_error(
                    run_generate_fallback_fn=lambda **fallback_kwargs: run_generate_fallback(
                        model=self.model,
                        tokenizer=self.tokenizer,
                        torch_module=torch,
                        logger_instance=logger,
                        **fallback_kwargs,
                    ),
                    logger_instance=logger,
                    **kwargs,
                ),
                is_cuda_kernel_image_error_fn=is_cuda_kernel_image_error,
                pixel_values=pixel_values,
                question=prompt.strip(),
                num_patches_list=num_patches_list,
                generation_config=generation_config,
                model_device=model_device,
                logger_instance=logger,
            )
            normalized = str(output_text or "").strip()
            return normalized or None
        except Exception as error:
            log_failure_context(
                error=error,
                elapsed_seconds=0.0,
                width=width,
                height=height,
                model_device=model_device,
                model=self.model,
                torch_module=torch,
                resolve_model_device_fn=resolve_model_device,
                logger_instance=logger,
            )
            return None
