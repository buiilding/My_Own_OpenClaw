"""
Static configuration for online and supported models.
"""

from typing import Dict, List

# Curated registry of popular online AI models (as of November 2025)
# Separate lists for thinking and non-thinking models for cleaner code

ONLINE_MODELS: Dict[str, List[str]] = {
    "openai": [
        "gpt-5",  # latest flagship [web:9][web:12]
        "gpt-5-mini",  # fast, low-cost variant [web:12]
        "gpt-4.1",  # improved GPT-4 replacement [web:6]
    ],
    "anthropic": [
        "claude-3-haiku-20240307",  # Claude 3 Haiku (confirmed working)
        "claude-sonnet-4-20250522",  # Claude Sonnet 4 (non-thinking)
        "claude-sonnet-4-5-20250929",  # Claude Sonnet 4.5 (non-thinking)
        "claude-haiku-4-5-20251001",  # Claude Haiku 4.5 (non-thinking)
        "claude-haiku-4-5",  # Claude Haiku 4.5 alternative format (non-thinking)
    ],
    "gemini": [
        "gemini-2.0-flash-lite",  # previous generation lightweight
        "gemini-2.0-flash-exp",  # experimental variant
        "gemini-2.0-flash",  # previous generation flash model
        "computer-use-preview",  # computer use capabilities
    ],
    "meta": [
        "llama-4-scout",  # latest open-source release [web:6][web:9]
        "llama-4-maverick",  # multimodal variant from Llama 4 family
        "llama-3.2-vision",  # Llama 3.2 multimodal (text + image)
    ],
    "xai": [
        "grok-4",  # advanced, multimodal reasoning (text + image) [web:6][web:16]
        "grok-3",  # reasoning and coding; limited multimodal support [web:6]
        "grok-1.5v",  # first multimodal Grok model (text + vision) [venturebeat.com]
    ],
    "mistral_multimodal": [
        "pixtral-12b-2409",  # 12B parameters, natively multimodal (text + images) :contentReference[oaicite:1]{index=1}
        "pixtral-large",  # 124B parameters, frontier-class multimodal (text + images) :contentReference[oaicite:2]{index=2}
    ],
    "qwen_multimodal": [
        "qwen2.5-omni",  # end-to-end multimodal: text + image + audio + video :contentReference[oaicite:1]{index=1}
        "qwen3-omni",  # natively omni-modal: text, images, audio, video :contentReference[oaicite:2]{index=2}
        "qwen3-vl",  # vision-language variant: text + image (and video) support :contentReference[oaicite:3]{index=3}
    ],
    "openrouter": [
        "openrouter/meta-llama/llama-4-scout",  # supports native text + image input. :contentReference[oaicite:2]{index=2}
        "openrouter/qwen/qwen3-vl-32b-instruct",  # vision-language (text + image/video) model. :contentReference[oaicite:3]{index=3}
        "openrouter/qwen/qwen3-vl-235b-a22b-instruct",  # vision-language (text + image/video) model. :contentReference[oaicite:4]{index=4}
    ],
}

# Models that support thinking tokens (reasoning)
# Only including models confirmed working (not deprecated)
ONLINE_THINKING_MODELS: Dict[str, List[str]] = {
    "anthropic": [
        # Claude 3.7 models with thinking support
        "claude-3-7-sonnet-20250219",  # Claude 3.7 Sonnet (latest) - supports thinking
        # Claude 4.x models with thinking support
        "claude-sonnet-4-20250522",  # Claude Sonnet 4 (thinking)
        "claude-sonnet-4-5-20250929",  # Claude Sonnet 4.5 (thinking)
        "claude-haiku-4-5-20251001",  # Claude Haiku 4.5 (thinking)
        "claude-haiku-4-5",  # Claude Haiku 4.5 (alternative format, thinking)
    ],
    "gemini": [
        "gemini-2.5-pro",  # newest flagship with thinking
        "gemini-2.5-flash",  # fast, high-throughput with thinking
        "gemini-2.5-flash-lite",  # lightweight variant with thinking
    ],
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

