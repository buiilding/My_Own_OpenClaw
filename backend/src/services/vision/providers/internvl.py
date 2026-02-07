"""
InternVL Vision Model Provider.

Provides InternVL model for vision-language tasks like UI grounding.
Based on CoAct-1's implementation, adapted for desktop assistant.
"""
import asyncio
import base64
import logging
from io import BytesIO
from typing import Optional, Tuple

from PIL import Image

from backend.src.services.vision.coordinates import (
    extract_first_point,
    extract_last_bbox,
    scale_norm_to_pixels,
)
from backend.src.services.vision.providers.base import (
    BaseVisionModel,
    VISION_MODELS_AVAILABLE,
    load_model_with_fallbacks,
)

logger = logging.getLogger(__name__)

# Image normalization constants.
INTERNVL_MEAN = (0.485, 0.456, 0.406)
INTERNVL_STD = (0.229, 0.224, 0.225)

# Import InternVL-specific dependencies
if VISION_MODELS_AVAILABLE:
    import einops  # Required for InternVL model operations
    import timm  # Required for InternVL vision components
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
    Based on CoAct-1's implementation, adapted for desktop assistant.
    """

    def _load(self):
        """Load the InternVL model and tokenizer."""
        try:
            # Check if flash-attn is available
            try:
                import flash_attn

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
            logger.info(
                f"Loaded InternVL model: {self.model_name} on {self.model.device} "
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

        model = AutoModel.from_pretrained(self.model_name, **kwargs)
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
                None,
                self._predict_sync,
                image_b64,
                instruction
            )

    def _predict_sync(
        self, image_b64: str, instruction: str
    ) -> Optional[Tuple[int, int]]:
        """
        Synchronous implementation of prediction logic.
        
        This method contains all blocking operations (base64 decoding, PIL processing,
        model inference) that must run off the event loop.
        """
        import hashlib
        import time
        vision_prediction_start = time.perf_counter()
        try:
            # SECURITY: Sanitize instruction in logs to prevent PII leakage
            # Truncate to first 50 chars and append hash for identification
            instruction_preview = instruction[:50] if len(instruction) > 50 else instruction
            instruction_hash = hashlib.sha256(instruction.encode()).hexdigest()[:8]
            logger.info(
                f"Starting InternVL prediction for instruction (preview: {instruction_preview}..., hash: {instruction_hash})"
            )
            logger.info(
                f"Model device: {self.model.device}, CUDA available: {torch.cuda.is_available()}"
            )

            # Decode and process image
            img_bytes = base64.b64decode(image_b64)
            image = Image.open(BytesIO(img_bytes))
            width, height = image.size
            logger.info(f"Image decoded: {width}x{height}, mode: {image.mode}")

            # Prepare grounding prompt (CoAct-1 style)
            grounding_prompt = (
                f"Please provide the bounding box coordinate of the UI element this user instruction describes: <ref>{instruction}</ref>. "
                f"Answer in the format of [[x1, y1, x2, y2]]"
            )
            # SECURITY: Don't log the full grounding prompt as it contains the instruction
            logger.debug("Grounding prompt prepared (instruction sanitized in logs)")

            # Convert image to pixel values using CoAct-1 method
            pixel_values, num_patches_list = self._images_to_pixel_values(
                [image], input_size=448, max_num=12
            )
            logger.info(
                f"Image processed to pixel values: {pixel_values.shape if pixel_values is not None else None}, num_patches: {num_patches_list}"
            )

            if pixel_values is None:
                logger.error("Failed to process image into pixel values")
                return None

            # Convert to model dtype and move to device
            # CORRECTNESS: Use model's actual dtype instead of hardcoded bfloat16
            # to match the dtype used during model loading (bfloat16, float16, or float32)
            model_dtype = self._model_dtype
            if model_dtype is None:
                # Fallback: infer dtype from model parameters if not stored
                try:
                    model_dtype = next(self.model.parameters()).dtype
                except (StopIteration, AttributeError):
                    # Last resort: use bfloat16 (most common case)
                    model_dtype = torch.bfloat16
                    logger.warning("Could not determine model dtype, defaulting to bfloat16")
            
            pixel_values = pixel_values.to(model_dtype).to(self.model.device)

            # Use InternVL's chat interface (like CoAct-1)
            logger.info("Using InternVL chat interface for generation")

            # Format question with image placeholder (InternVL style)
            question = f"<image>\n{grounding_prompt}"
            logger.info(f"Chat question: {question}")

            # Prepare generation config
            generation_config = dict(
                max_new_tokens=256,
                do_sample=False,  # Deterministic for grounding
                temperature=0.0,
            )

            logger.info("Starting InternVL chat generation...")
            try:
                # Use the chat method which properly handles vision inputs
                if len(num_patches_list) > 1:
                    response = self.model.chat(
                        self.tokenizer,
                        pixel_values,
                        question,
                        generation_config,
                        num_patches_list=num_patches_list,
                    )
                else:
                    response = self.model.chat(
                        self.tokenizer, pixel_values, question, generation_config
                    )
                logger.info(f"Chat response received: {repr(response)}")
                output_text = response or ""

            except Exception as chat_error:
                logger.error(
                    f"Chat method failed: {chat_error}, trying generate fallback on CUDA"
                )
                # Fallback to manual tokenization if chat fails (still on CUDA)
                try:
                    messages = [
                        {"role": "user", "content": f"<image>\n{grounding_prompt}"}
                    ]
                    inputs = self.tokenizer.apply_chat_template(
                        messages,
                        add_generation_prompt=True,
                        tokenize=True,
                        return_tensors="pt",
                        return_dict=True,
                    ).to(self.model.device)

                    # Add image inputs for generate fallback
                    inputs["pixel_values"] = pixel_values
                    if num_patches_list:
                        inputs["num_patches"] = torch.tensor(num_patches_list).to(
                            self.model.device
                        )

                    with torch.no_grad():
                        generation_output = self.model.generate(
                            **inputs,
                            max_new_tokens=256,
                            do_sample=False,
                            temperature=0.0,
                            use_cache=True,
                        )

                    output_text = self.tokenizer.decode(
                        generation_output[0], skip_special_tokens=True
                    ).strip()
                    logger.info(
                        f"Generate fallback on CUDA succeeded: {repr(output_text)}"
                    )

                except Exception as generate_error:
                    logger.error(
                        f"Both CUDA methods failed: chat={chat_error}, generate={generate_error}"
                    )
                    raise RuntimeError(
                        f"Vision model inference failed on CUDA: {generate_error}"
                    ) from chat_error

            if not output_text:
                logger.error("Empty output from model")
                return None

            # Parse coordinates using extracted utilities
            point = extract_first_point(output_text)
            logger.info(f"Extracted point: {point}")

            if point is None:
                bbox = extract_last_bbox(output_text)
                logger.info(f"Extracted bbox: {bbox}")
                if bbox is None:
                    logger.error(
                        f"Could not parse coordinates from output: {output_text}"
                    )
                    return None
                x1, y1, x2, y2 = bbox
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                point = (cx, cy)
                logger.info(f"Calculated center point from bbox: {point}")

            x_norm, y_norm = point
            x_px, y_px = scale_norm_to_pixels(x_norm, y_norm, width, height)
            vision_prediction_time = time.perf_counter() - vision_prediction_start
            logger.info(f"[Timing] Vision model prediction completed in {vision_prediction_time:.3f}s (coordinates=({x_px}, {y_px}))")
            logger.info(f"Final pixel coordinates: ({x_px}, {y_px})")
            return (x_px, y_px)

        except Exception as e:
            import traceback
            vision_prediction_time = time.perf_counter() - vision_prediction_start
            logger.error(f"[Timing] Vision model prediction failed after {vision_prediction_time:.3f}s: {e}")
            logger.error(f"InternVL prediction failed: {e}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            try:
                logger.error(f"Image size: {width}x{height}")
            except (NameError, UnboundLocalError):
                logger.error("Image size not available")
            logger.error(f"Model device: {self.model.device}")
            try:
                logger.error(f"CUDA available: {torch.cuda.is_available()}")
                if torch.cuda.is_available():
                    logger.error(
                        f"CUDA memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB"
                    )
                    logger.error(
                        f"CUDA allocated: {torch.cuda.memory_allocated() / 1024**3:.1f}GB"
                    )
                    logger.error(
                        f"CUDA reserved: {torch.cuda.memory_reserved() / 1024**3:.1f}GB"
                    )
            except (RuntimeError, AttributeError) as cuda_e:
                logger.error(f"CUDA info error: {cuda_e}")
            return None
