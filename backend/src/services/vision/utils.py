"""
Vision service utilities.
"""
from typing import Optional

DEFAULT_VISION_MODEL = "OpenGVLab/InternVL3_5-4B"
_HF_LOCAL_PREFIX = "huggingface-local/"


def normalize_model_name(model_name: Optional[str]) -> str:
    """
    Normalize model name by removing huggingface-local prefix if present.
    
    Args:
        model_name: Model name, possibly with huggingface-local/ prefix
        
    Returns:
        Normalized model name without prefix
    """
    if not model_name:
        return DEFAULT_VISION_MODEL

    normalized = model_name.strip()
    if not normalized:
        return DEFAULT_VISION_MODEL

    if normalized.casefold().startswith(_HF_LOCAL_PREFIX):
        return normalized[len(_HF_LOCAL_PREFIX):]
    return normalized
