"""
InternVL Vision Model Handler.

Provides InternVL model for vision-language tasks like UI grounding.
Based on CoAct-1's implementation, adapted for desktop assistant.
"""
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

logger = logging.getLogger(__name__)

VISION_MODELS_AVAILABLE = False
try:
    import einops  # Required for InternVL model operations
    import timm  # Required for InternVL vision components
    import torch
    import torchvision.transforms as T
    from torchvision.transforms.functional import InterpolationMode
    from transformers import AutoModel, AutoTokenizer

    VISION_MODELS_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Vision model dependencies not available: {e}")
    torch = None
    AutoModel = None
    AutoTokenizer = None


class InternVLModel:
    """
    Generic Hugging Face vision-language model handler for InternVL models.
    Based on CoAct-1's implementation, adapted for desktop assistant.
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
        self._load()

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

            # Try device_map with auto device placement (like Coact-1)
            try:
                self.model = AutoModel.from_pretrained(
                    self.model_name,
                    dtype=torch.bfloat16,
                    low_cpu_mem_usage=True,
                    use_flash_attn=use_flash_attn,
                    device_map="auto",  # Let accelerate decide device placement
                    trust_remote_code=self.trust_remote_code,
                ).eval()
                logger.info(
                    f"Loaded InternVL model with device_map: {self.model_name} on {self.model.device}"
                )
            except Exception as device_map_error:
                logger.warning(
                    f"Device_map failed ({device_map_error}), trying direct loading"
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
                            use_flash_attn=False,
                            trust_remote_code=self.trust_remote_code,
                        )
                        .to(device)
                        .eval()
                    )
                    logger.info(
                        f"Loaded InternVL model on {device} with {dtype}: {self.model_name}"
                    )
                except Exception as direct_error:
                    logger.warning(
                        f"Direct loading failed ({direct_error}), trying CPU fallback"
                    )
                    # CPU fallback as last resort
                    try:
                        self.model = (
                            AutoModel.from_pretrained(
                                self.model_name,
                                dtype=torch.float32,
                                low_cpu_mem_usage=True,
                                use_flash_attn=False,
                                trust_remote_code=self.trust_remote_code,
                            )
                            .to("cpu")
                            .eval()
                        )
                        logger.info(
                            f"Loaded InternVL model on CPU (fallback): {self.model_name}"
                        )
                    except Exception as cpu_error:
                        logger.error(
                            f"All loading methods failed: device_map={device_map_error}, direct={direct_error}, cpu={cpu_error}"
                        )
                        raise RuntimeError(f"Failed to load vision model: {cpu_error}")

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

    def _build_transform(self, input_size: int):
        """Build image transformation pipeline."""
        if not VISION_MODELS_AVAILABLE or T is None:
            raise ImportError("Vision model dependencies not available")

        MEAN = (0.485, 0.456, 0.406)
        STD = (0.229, 0.224, 0.225)
        transform = T.Compose(
            [
                T.Lambda(lambda img: img.convert("RGB") if img.mode != "RGB" else img),
                T.Resize(
                    (input_size, input_size), interpolation=InterpolationMode.BICUBIC
                ),
                T.ToTensor(),
                T.Normalize(mean=MEAN, std=STD),
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
        """
        try:
            logger.info(f"Starting InternVL prediction for instruction: {instruction}")
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
            logger.info(f"Grounding prompt: {grounding_prompt}")

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

            # Convert to bfloat16 and move to device (like CoAct-1)
            pixel_values = pixel_values.to(torch.bfloat16).to(self.model.device)

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
            logger.info(f"Final pixel coordinates: ({x_px}, {y_px})")
            return (x_px, y_px)

        except Exception as e:
            import traceback

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
