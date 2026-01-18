"""
Model Service.

Responsible for discovering and aggregating available LLM models from:
1. Static configuration (Online models)
2. Dynamic discovery via Providers (Local models)
"""

import logging
from typing import Dict, List

from backend.src.core.config import AppConfig
from backend.src.llm.models_config import ONLINE_MODELS, ONLINE_THINKING_MODELS, LOCAL_VISION_MODELS
from backend.src.llm.providers import create_provider_factory
from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


class ModelService:
    def __init__(self, config: AppConfig):
        self.config = config

    def get_online_models(self) -> List[Dict[str, str]]:
        """
        Return curated list of popular online models (non-thinking).
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

    def get_thinking_models(self) -> List[Dict[str, str]]:
        """
        Return curated list of models that support thinking tokens.
        """
        thinking_models = []
        for provider, models in ONLINE_THINKING_MODELS.items():
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

    def get_all_online_models(self) -> List[Dict[str, str]]:
        """
        Return all online models (both thinking and non-thinking).
        
        Deduplicates models that appear in both lists, preferring the thinking version.
        """
        online_models = self.get_online_models()
        thinking_models = self.get_thinking_models()
        
        # Create a set of model IDs from thinking models to check for duplicates
        thinking_model_ids = {
            (m["provider"], m["id"]) for m in thinking_models
        }
        
        # Filter out duplicates from online_models (keep thinking versions)
        unique_online_models = [
            m for m in online_models
            if (m["provider"], m["id"]) not in thinking_model_ids
        ]
        
        # Combine unique online models with thinking models
        all_models = unique_online_models + thinking_models
        
        # Sort by provider first, then by thinking status
        all_models.sort(key=lambda m: (
            m["provider"],
            m.get("supports_thinking", False)
        ))
        return all_models

    def get_vision_models(self) -> List[Dict[str, str]]:
        """
        Return curated list of local vision models.
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

    async def get_local_models(self) -> List[Dict[str, str]]:
        """
        Fetch available models from local providers (Ollama, LM Studio).
        
        Uses the provider factory to ensure consistent provider instantiation
        and benefit from caching. This prevents duplicate provider instances
        and ensures configuration consistency.
        
        Returns:
            List of available local models. If a provider fails, it logs a warning
            but continues to try other providers. Returns empty list if all providers fail.
        """
        local_models = []
        provider_failures = []
        
        # Get provider factory (cached, uses same instances as rest of system)
        factory = create_provider_factory(self.config)
        
        # Try Ollama
        ollama_provider = factory.get("ollama")
        if ollama_provider:
            try:
                models = await ollama_provider.list_models()
                local_models.extend(models)
                logger.debug(f"Successfully listed {len(models)} Ollama models")
            except Exception as e:
                provider_failures.append(("Ollama", str(e)))
                logger.warning(
                    f"Failed to list Ollama models: {e}",
                    exc_info=logger.isEnabledFor(logging.DEBUG)
                )
        else:
            logger.debug("Ollama provider not configured or unavailable")

        # Try LM Studio
        lmstudio_provider = factory.get("lmstudio")
        if lmstudio_provider:
            try:
                models = await lmstudio_provider.list_models()
                local_models.extend(models)
                logger.debug(f"Successfully listed {len(models)} LM Studio models")
            except Exception as e:
                provider_failures.append(("LM Studio", str(e)))
                logger.warning(
                    f"Failed to list LM Studio models: {e}",
                    exc_info=logger.isEnabledFor(logging.DEBUG)
                )
        else:
            logger.debug("LM Studio provider not configured or unavailable")

        # Log summary if all providers failed
        if provider_failures and not local_models:
            logger.warning(
                f"All local providers failed to list models. "
                f"Failures: {', '.join(f'{name}: {error}' for name, error in provider_failures)}"
            )
        elif provider_failures:
            logger.info(
                f"Some local providers failed, but found {len(local_models)} models. "
                f"Failures: {', '.join(f'{name}' for name, _ in provider_failures)}"
            )

        return local_models

    async def get_all_models(self) -> Dict[str, List[Dict[str, str]]]:
        """
        Fetch all available models.
        """
        return {
            "local": await self.get_local_models(),
            "online": self.get_all_online_models(),
            "vision": self.get_vision_models(),
        }



