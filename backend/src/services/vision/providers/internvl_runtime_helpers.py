"""InternVL runtime helper functions for inference/fallback orchestration."""

import hashlib
import traceback
from typing import Any, Callable, Optional, Tuple

GROUNDING_PROMPT_TEMPLATE = (
    "Please provide the bounding box coordinate of the UI element this user "
    "instruction describes: <ref>{instruction}</ref>. "
    "Answer in the format of [[x1, y1, x2, y2]]"
)


def build_instruction_log_metadata(
    instruction: str, preview_length: int = 50
) -> Tuple[str, str]:
    """Return a bounded instruction preview and short stable hash for safe logs."""
    preview = (
        instruction[:preview_length]
        if len(instruction) > preview_length
        else instruction
    )
    instruction_hash = hashlib.sha256(instruction.encode()).hexdigest()[:8]
    return preview, instruction_hash


def build_grounding_prompt(instruction: str) -> str:
    """Build the shared grounding prompt used by vision providers."""
    return GROUNDING_PROMPT_TEMPLATE.format(instruction=instruction)


def is_meta_tensor_loading_error(error: Exception) -> bool:
    """Return True for meta-tensor construction failures during model load."""
    message = str(error).lower()
    return "meta tensor" in message or "tensor.item() cannot be called on meta tensors" in message


def is_cuda_kernel_image_error(error: Exception) -> bool:
    """Return True when CUDA kernel binary is incompatible with the active GPU."""
    message = str(error).lower()
    return (
        "no kernel image is available for execution on the device" in message
        or "cudaerrornokernelimagefordevice" in message
    )


def resolve_model_dtype(
    *,
    cached_dtype: Any,
    model: Any,
    torch_module: Any,
    logger_instance: Any,
) -> Any:
    """Resolve inference dtype from loader metadata or model parameters."""
    if cached_dtype is not None:
        return cached_dtype

    try:
        return next(model.parameters()).dtype
    except (StopIteration, AttributeError):
        logger_instance.warning(
            "Could not determine model dtype, defaulting to bfloat16"
        )
        return torch_module.bfloat16


def prepare_question(
    instruction: str,
    *,
    build_grounding_prompt_fn: Callable[[str], str],
) -> str:
    """Build the InternVL chat question from the shared grounding prompt."""
    return f"<image>\n{build_grounding_prompt_fn(instruction)}"


def run_chat_generation(
    *,
    model: Any,
    tokenizer: Any,
    pixel_values: Any,
    question: str,
    num_patches_list: list[int],
    generation_config: dict[str, Any],
    logger_instance: Any,
) -> str:
    """Run InternVL `chat(...)` with optional num-patches metadata."""
    if len(num_patches_list) > 1:
        response = model.chat(
            tokenizer,
            pixel_values,
            question,
            generation_config,
            num_patches_list=num_patches_list,
        )
    else:
        response = model.chat(tokenizer, pixel_values, question, generation_config)
    logger_instance.info(f"Chat response received: {repr(response)}")
    return response or ""


def run_generate_fallback(
    *,
    model: Any,
    tokenizer: Any,
    torch_module: Any,
    pixel_values: Any,
    question: str,
    num_patches_list: list[int],
    model_device: Any,
    logger_instance: Any,
) -> str:
    """Run `generate(...)` fallback path on the currently loaded model."""
    messages = [{"role": "user", "content": question}]
    inputs = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_tensors="pt",
        return_dict=True,
    ).to(model_device)

    inputs["pixel_values"] = pixel_values
    if num_patches_list:
        inputs["num_patches"] = torch_module.tensor(num_patches_list).to(model_device)

    with torch_module.no_grad():
        generation_output = model.generate(
            **inputs,
            max_new_tokens=256,
            do_sample=False,
            temperature=0.0,
            use_cache=True,
        )

    output_text = tokenizer.decode(generation_output[0], skip_special_tokens=True).strip()
    logger_instance.info(f"Generate fallback on CUDA succeeded: {repr(output_text)}")
    return output_text


def run_generate_fallback_with_chat_error(
    *,
    run_generate_fallback_fn: Callable[..., str],
    pixel_values: Any,
    question: str,
    num_patches_list: list[int],
    model_device: Any,
    chat_error: Exception,
    logger_instance: Any,
) -> str:
    """Run generate fallback and wrap dual failure as one RuntimeError."""
    try:
        return run_generate_fallback_fn(
            pixel_values=pixel_values,
            question=question,
            num_patches_list=num_patches_list,
            model_device=model_device,
        )
    except Exception as generate_error:
        logger_instance.error(
            f"Both CUDA methods failed: chat={chat_error}, generate={generate_error}"
        )
        raise RuntimeError(
            f"Vision model inference failed on CUDA: {generate_error}"
        ) from chat_error


def disable_flash_attention_runtime(*, model: Any, logger_instance: Any) -> bool:
    """Disable flash-attention switches on loaded modules for runtime fallback."""
    disabled_count = 0

    config = getattr(model, "config", None)
    vision_config = getattr(config, "vision_config", None) if config else None
    for cfg in (config, vision_config):
        if cfg is not None and getattr(cfg, "use_flash_attn", False):
            setattr(cfg, "use_flash_attn", False)
            disabled_count += 1

    for module in model.modules():
        if getattr(module, "use_flash_attn", False):
            setattr(module, "use_flash_attn", False)
            disabled_count += 1

    if disabled_count:
        logger_instance.warning(
            "Disabled flash-attention runtime flags on %d InternVL module/config entries; retrying inference",
            disabled_count,
        )
    return disabled_count > 0


def run_chat_with_fallbacks(
    *,
    run_chat_generation_fn: Callable[..., str],
    disable_flash_attention_runtime_fn: Callable[[], bool],
    run_generate_fallback_with_chat_error_fn: Callable[..., str],
    is_cuda_kernel_image_error_fn: Callable[[Exception], bool],
    pixel_values: Any,
    question: str,
    num_patches_list: list[int],
    generation_config: dict[str, Any],
    model_device: Any,
    logger_instance: Any,
) -> str:
    """Run chat generation with runtime flash-attn/CUDA fallback handling."""
    try:
        return run_chat_generation_fn(
            pixel_values=pixel_values,
            question=question,
            num_patches_list=num_patches_list,
            generation_config=generation_config,
        )
    except Exception as chat_error:
        if is_cuda_kernel_image_error_fn(chat_error) and disable_flash_attention_runtime_fn():
            logger_instance.warning(
                "Detected CUDA kernel-image mismatch in flash-attn path; retrying chat with flash-attn disabled"
            )
            try:
                return run_chat_generation_fn(
                    pixel_values=pixel_values,
                    question=question,
                    num_patches_list=num_patches_list,
                    generation_config=generation_config,
                )
            except Exception as retry_chat_error:
                logger_instance.error(
                    f"Chat retry with flash-attn disabled failed: {retry_chat_error}, trying generate fallback on CUDA"
                )
                return run_generate_fallback_with_chat_error_fn(
                    pixel_values=pixel_values,
                    question=question,
                    num_patches_list=num_patches_list,
                    model_device=model_device,
                    chat_error=retry_chat_error,
                )

        logger_instance.error(
            f"Chat method failed: {chat_error}, trying generate fallback on CUDA"
        )
        return run_generate_fallback_with_chat_error_fn(
            pixel_values=pixel_values,
            question=question,
            num_patches_list=num_patches_list,
            model_device=model_device,
            chat_error=chat_error,
        )


def log_failure_context(
    *,
    error: Exception,
    elapsed_seconds: float,
    width: Optional[int],
    height: Optional[int],
    model_device: Optional[Any],
    model: Any,
    torch_module: Any,
    resolve_model_device_fn: Callable[[Any], Any],
    logger_instance: Any,
) -> None:
    """Log InternVL failure diagnostics with image/device/CUDA context."""
    logger_instance.error(
        f"[Timing] Vision model prediction failed after {elapsed_seconds:.3f}s: {error}"
    )
    logger_instance.error(f"InternVL prediction failed: {error}")
    logger_instance.error(f"Full traceback: {traceback.format_exc()}")
    if width is None or height is None:
        logger_instance.error("Image size not available")
    else:
        logger_instance.error(f"Image size: {width}x{height}")
    logger_instance.error(f"Model device: {model_device or resolve_model_device_fn(model)}")
    try:
        logger_instance.error(f"CUDA available: {torch_module.cuda.is_available()}")
        if torch_module.cuda.is_available():
            logger_instance.error(
                f"CUDA memory: {torch_module.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB"
            )
            logger_instance.error(
                f"CUDA allocated: {torch_module.memory_allocated() / 1024**3:.1f}GB"
            )
            logger_instance.error(
                f"CUDA reserved: {torch_module.memory_reserved() / 1024**3:.1f}GB"
            )
    except (RuntimeError, AttributeError) as cuda_error:
        logger_instance.error(f"CUDA info error: {cuda_error}")
