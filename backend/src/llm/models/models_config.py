"""
Static configuration for online and supported models.
"""

from typing import Dict, List

# Curated registry of popular online AI models.
# Keep provider keys aligned with supported providers in backend.src.llm.providers

ONLINE_MODELS: Dict[str, List[str]] = {
    "openai": [
        "gpt-5.2",
        "gpt-5.1",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4o",
        "gpt-4o-mini",
    ],
    "anthropic": [
        "claude-opus-4-1-20250805",
        "claude-opus-4-20250514",
        "claude-sonnet-4-5-20250929",
        "claude-sonnet-4-20250522",
        "claude-haiku-4-5-20251001",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
    ],
    "gemini": [
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ],
    "mistral": [
        "mistral-large-latest",
        "mistral-small-latest",
    ],
    "openrouter": [
        "auto",
        "qwen/qwen3-vl-235b-a22b-thinking",
    ],
    "kimi-coding": [
        "k2p5",
    ],
}

# Models that support thinking tokens (reasoning)
# Only including models confirmed working (not deprecated)
ONLINE_THINKING_MODELS: Dict[str, List[str]] = {
    "anthropic": [
        "claude-opus-4-1-20250805",
        "claude-opus-4-20250514",
        "claude-sonnet-4-5-20250929",
        "claude-sonnet-4-20250522",
        "claude-haiku-4-5-20251001",
    ],
    "gemini": [
        "gemini-3.1-pro-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ],
    "openrouter": [
        "qwen/qwen3-vl-235b-a22b-thinking",
    ],
}

# Models that emit reasoning token usage but do not reliably stream
# textual thought deltas through LiteLLM streaming payloads.
# Keep empty unless a concrete provider/model regression is confirmed.
THINKING_TEXT_STREAM_UNSUPPORTED_MODELS: Dict[str, List[str]] = {
}

# Local HuggingFace vision models available via LiteLLM
LOCAL_VISION_MODELS: Dict[str, List[str]] = {
    "huggingface-local": [
        "OpenGVLab/InternVL3_5-4B",  # Latest InternVL model for UI grounding
        "OpenGVLab/InternVL2_5-8B",  # Previous InternVL version
        "OpenGVLab/InternVL2_5-4B",  # Smaller InternVL model
        "OpenGVLab/InternVL2_5-2B",  # Lightweight InternVL model
        "OpenGVLab/InternVL2_5-1B",  # Fastest InternVL model
    ]
}
