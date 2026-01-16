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
from backend.src.llm.providers.local import OllamaProvider, LMStudioProvider

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
        """
        all_models = self.get_online_models() + self.get_thinking_models()
        
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
        """
        local_models = []
        
        # Check if Ollama is enabled/configured? 
        # For now, we just try to list if the provider class exists.
        # The previous implementation tried both regardless of explicit enable flag (it just failed silently).
        
        # Ollama
        try:
            ollama = OllamaProvider(self.config)
            local_models.extend(await ollama.list_models())
        except Exception as e:
            logger.debug(f"Failed to list Ollama models: {e}")

        # LM Studio
        try:
            lmstudio = LMStudioProvider(self.config)
            local_models.extend(await lmstudio.list_models())
        except Exception as e:
            logger.debug(f"Failed to list LM Studio models: {e}")

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



