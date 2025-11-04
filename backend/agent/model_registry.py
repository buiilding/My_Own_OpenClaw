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
ONLINE_MODELS = {
    "openai": [
        "gpt-5",  # latest flagship [web:9][web:12]
        "gpt-5-mini",  # fast, low-cost variant [web:12]
        "gpt-4.1",  # improved GPT-4 replacement [web:6]
        "gpt-oss-120b",  # new open-weight, Apache 2.0 [web:9][web:20]
        "gpt-oss-20b",  # new open-weight, Apache 2.0 [web:20]
    ],
    "anthropic": [
        "claude-4.1",  # latest flagship [web:6][web:16]
        "claude-3.7-sonnet",  # high-parameter, recent release [web:6]
        "claude-3.5-sonnet",  # established model [web:6][web:9]
        "claude-3-opus",  # older, high-quality [web:6]
        "claude-3-haiku",  # cost-efficient variant [web:10]
    ],
    "gemini": [
        # Text-out models
        "gemini-2.5-pro",  # newest flagship
        "gemini-2.5-flash",  # fast, high-throughput
        "gemini-2.5-flash-lite",  # lightweight variant
        "gemini-2.0-flash-lite",  # previous generation lightweight
        "gemini-2.0-flash-exp",  # experimental variant
        "gemini-2.0-flash",  # previous generation flash model
        # Other models
        "computer-use-preview",  # computer use capabilities
        "gemini-robotics-er-1.5-preview",  # robotics model
        # Multi-modal generative models
        "gemini-2.0-flash-preview-image-generation",  # image generation preview
        "gemini-2.5-flash-preview-image",  # image generation
        "gemini-2.5-flash-tts",  # text-to-speech
        "gemini-2.5-pro-tts",  # pro text-to-speech
        "imagen-3.0-generate",  # Imagen 3.0 image generation
        "imagen-4.0-fast-generate",  # Imagen 4.0 fast variant
        "imagen-4.0-generate",  # Imagen 4.0 standard
        "imagen-4.0-ultra-generate",  # Imagen 4.0 ultra
        "veo-2.0-generate-001",  # Veo 2.0 video generation
        "veo-3.0-fast-generate-preview",  # Veo 3.0 fast preview
        "veo-3.0-fast-generate",  # Veo 3.0 fast
        "veo-3.0-generate-preview",  # Veo 3.0 preview
        "veo-3.0-generate",  # Veo 3.0 standard
        # Live API models
        "gemini-2.0-flash-live",  # live API 2.0
        "gemini-2.5-flash-live",  # live API 2.5
        "gemini-2.5-flash-native-audio-dialog",  # native audio dialog
    ],
    "meta": [
        "llama-4-scout",  # latest open-source release [web:6][web:9]
        "llama-3.1-70b-instruct",  # popular instruction-tuned [web:6]
        "llama-3.3",  # coding focus [web:18]
    ],
    "xai": [
        "grok-4",  # advanced, multimodal reasoning [web:6][web:16]
        "grok-3",  # widely available [web:6]
    ],
    "mistral": [
        "mistral-large-24.11",  # latest flagship [web:7]
        "codestral-25.01",  # newest code model [web:7]
        "mistral-nemo",  # reasoning/lightweight [web:7]
        "pixtral-12x-2409",  # established creative model [web:6]
        "mistral-medium-2312",  # proven midsize [web:6]
    ],
    "qwen": [
        "qwen-3",  # high coding performance [web:6][web:18]
        "qwen-2.5-max",  # large variant [web:6]
    ],
    "openrouter": [
        "openrouter/auto",
        "openrouter/anthropic/claude-4.1-sonnet",
        "openrouter/xai/grok-5",
        "openrouter/google/gemini-2.5-pro",
        "openrouter/meta-llama/llama-4-scout",
    ],
}

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
    Return curated list of popular online models.

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
                }
            )
    return online_models


async def get_all_models() -> Dict[str, List[Dict[str, str]]]:
    """
    Fetch all available models (local and online).

    Returns:
        Dict with 'local' and 'online' keys.
    """
    return {
        "local": await get_local_models(),
        "online": get_online_models(),
    }
