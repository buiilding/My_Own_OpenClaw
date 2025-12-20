"""
Vision service utilities.
"""
from typing import Optional


def normalize_model_name(model_name: Optional[str]) -> str:
    """
    Normalize model name by removing huggingface-local prefix if present.
    
    Args:
        model_name: Model name, possibly with huggingface-local/ prefix
        
    Returns:
        Normalized model name without prefix
    """
    if not model_name:
        return "OpenGVLab/InternVL3_5-4B"
    
    if model_name.startswith("huggingface-local/"):
        return model_name.replace("huggingface-local/", "")
    
    return model_name

