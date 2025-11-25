"""
Model registry for online and local AI models.

Provides functions to retrieve lists of available models from various providers,
both online (cloud APIs) and local installations.
"""

import logging
from typing import Dict, List

import httpx

logger = logging.getLogger(__name__)

# Curated registry of popular online AI models (as of November 2025)
# Separate lists for thinking and non-thinking models for cleaner code

ONLINE_MODELS = {
    "openai": [
        "gpt-5",  # latest flagship [web:9][web:12]
        "gpt-5-mini",  # fast, low-cost variant [web:12]
        "gpt-4.1",  # improved GPT-4 replacement [web:6]
    ],
    "anthropic": [
        # Claude 3.0 models (older, no thinking support)
        # Note: Many 20240229 models are deprecated (404 errors)
        # Only including models confirmed working
        "claude-3-haiku-20240307",  # Claude 3 Haiku (confirmed working)
        # Claude 4.x models (non-thinking versions)
        "claude-sonnet-4-20250522",  # Claude Sonnet 4 (non-thinking)
        "claude-sonnet-4-5-20250929",  # Claude Sonnet 4.5 (non-thinking)
        "claude-haiku-4-5-20251001",  # Claude Haiku 4.5 (non-thinking)
        "claude-haiku-4-5",  # Claude Haiku 4.5 alternative format (non-thinking)
    ],
    "gemini": [
        # Text-out models (non-thinking)
        "gemini-2.0-flash-lite",  # previous generation lightweight
        "gemini-2.0-flash-exp",  # experimental variant
        "gemini-2.0-flash",  # previous generation flash model
        # Other models
        "computer-use-preview",  # computer use capabilities
    ],
}

# Models that support thinking tokens (reasoning)
# Only including models confirmed working (not deprecated)
THINKING_MODELS = {
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

# Add remaining providers to ONLINE_MODELS
ONLINE_MODELS.update({
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
})

# Local model providers and their endpoints
LOCAL_PROVIDERS = {
    "ollama": {
        "base_url": "http://localhost:11434",
        "list_endpoint": "/api/tags",
    },
    "lmstudio": {
        "base_url": "http://localhost:1234",
        "list_endpoint": "/v1/models",
    },
}

# Local HuggingFace vision models available via LiteLLM
LOCAL_VISION_MODELS = {
    "huggingface-local": [
        "OpenGVLab/InternVL3_5-4B",  # Latest InternVL model for UI grounding
        "OpenGVLab/InternVL2_5-8B",  # Previous InternVL version
        "OpenGVLab/InternVL2_5-4B",  # Smaller InternVL model
        "OpenGVLab/InternVL2_5-2B",  # Lightweight InternVL model
        "OpenGVLab/InternVL2_5-1B",  # Fastest InternVL model
    ]
}


async def _fetch_ollama_models() -> List[Dict[str, str]]:
    """Fetch models from Ollama provider."""
    models = []
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(
                f"{LOCAL_PROVIDERS['ollama']['base_url']}"
                f"{LOCAL_PROVIDERS['ollama']['list_endpoint']}"
            )
            if response.status_code == 200:
                data = response.json()
                if "models" in data:
                    for model in data["models"]:
                        model_name = model.get("name", "")
                        if model_name:
                            models.append(
                                {
                                    "id": model_name,
                                    "provider": "ollama",
                                    "display_name": model_name,
                                }
                            )
            else:
                logger.warning(
                    "Ollama server returned unexpected status code %d: %s",
                    response.status_code,
                    response.reason or response.text[:100]
                    if hasattr(response, "text")
                    else "No response details",
                )
    except httpx.ConnectError as e:
        logger.info(
            "Could not connect to Ollama server at %s: %s",
            LOCAL_PROVIDERS["ollama"]["base_url"],
            e,
        )
    except httpx.TimeoutException as e:
        logger.warning(
            "Timeout while connecting to Ollama server at %s: %s",
            LOCAL_PROVIDERS["ollama"]["base_url"],
            e,
        )
    # pylint: disable=broad-exception-caught
    except Exception as e:
        logger.warning(
            "An unexpected error occurred while fetching Ollama models: %s", e
        )
    return models


async def _fetch_lmstudio_models() -> List[Dict[str, str]]:
    """Fetch models from LM Studio provider."""
    models = []
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(
                f"{LOCAL_PROVIDERS['lmstudio']['base_url']}"
                f"{LOCAL_PROVIDERS['lmstudio']['list_endpoint']}"
            )
            if response.status_code == 200:
                data = response.json()
                if "data" in data:
                    for model in data["data"]:
                        model_id = model.get("id", "")
                        if model_id:
                            models.append(
                                {
                                    "id": model_id,
                                    "provider": "lmstudio",
                                    "display_name": model_id,
                                }
                            )
            else:
                logger.warning(
                    "LM Studio server returned unexpected status code %d: %s",
                    response.status_code,
                    response.reason or response.text[:100]
                    if hasattr(response, "text")
                    else "No response details",
                )
    except httpx.ConnectError as e:
        logger.info(
            "Could not connect to LM Studio server at %s: %s",
            LOCAL_PROVIDERS["lmstudio"]["base_url"],
            e,
        )
    except httpx.TimeoutException as e:
        logger.warning(
            "Timeout while connecting to LM Studio server at %s: %s",
            LOCAL_PROVIDERS["lmstudio"]["base_url"],
            e,
        )
    # pylint: disable=broad-exception-caught
    except Exception as e:
        logger.warning(
            "An unexpected error occurred while fetching LM Studio models: %s", e
        )
    return models


async def get_local_models() -> List[Dict[str, str]]:
    """
    Fetch available models from local providers (Ollama, LM Studio).

    Returns:
        List of model dicts with id, provider, display_name.
    """
    local_models = []
    local_models.extend(await _fetch_ollama_models())
    local_models.extend(await _fetch_lmstudio_models())
    return local_models


def get_online_models() -> List[Dict[str, str]]:
    """
    Return curated list of popular online models (non-thinking).

    Returns:
        List of model dicts with id, provider, display_name.
    """
    online_models = []
    for provider, models in ONLINE_MODELS.items():
        for model_id in models:
            online_models.append(
                {
                    "id": model_id,
                    "provider": provider,
                    "display_name": f"{provider}/{model_id}",
                    "supports_thinking": False,
                }
            )
    return online_models


def get_thinking_models() -> List[Dict[str, str]]:
    """
    Return curated list of models that support thinking tokens.

    Returns:
        List of model dicts with id, provider, display_name.
    """
    thinking_models = []
    for provider, models in THINKING_MODELS.items():
        for model_id in models:
            thinking_models.append(
                {
                    "id": model_id,
                    "provider": provider,
                    "display_name": f"{provider}/{model_id}",
                    "supports_thinking": True,
                }
            )
    return thinking_models


def get_all_online_models() -> List[Dict[str, str]]:
    """
    Return all online models (both thinking and non-thinking).
    Models are grouped by provider, with non-thinking models appearing before
    thinking models within each provider group.

    Returns:
        List of model dicts with id, provider, display_name, supports_thinking.
    """
    all_models = get_online_models() + get_thinking_models()
    
    # Sort by provider first, then by thinking status (non-thinking before thinking)
    # This ensures models from the same provider appear together in the UI
    all_models.sort(key=lambda m: (
        m["provider"],  # Group by provider first
        m.get("supports_thinking", False)  # Non-thinking (False) before thinking (True)
    ))
    
    return all_models


def get_vision_models() -> List[Dict[str, str]]:
    """
    Return curated list of local vision models for UI grounding.

    Returns:
        List of model dicts with id, provider, display_name.
    """
    vision_models = []
    for provider, models in LOCAL_VISION_MODELS.items():
        for model_id in models:
            vision_models.append(
                {
                    "id": f"{provider}/{model_id}",
                    "provider": provider,
                    "display_name": f"{provider}/{model_id}",
                }
            )
    return vision_models


async def get_all_models() -> Dict[str, List[Dict[str, str]]]:
    """
    Fetch all available models (local, online+thinking, vision).

    Returns:
        Dict with 'local', 'online', and 'vision' keys.
        'online' now includes both regular online models and thinking models.
    """
    return {
        "local": await get_local_models(),
        "online": get_all_online_models(),  # Combines online + thinking models
        "vision": get_vision_models(),
    }
