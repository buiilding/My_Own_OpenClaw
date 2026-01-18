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

    def _safe_timeout_conversion(self, default: float = 60.0) -> float:
        """
        Safely convert config timeout to float with validation.
        
        Args:
            default: Default timeout if conversion fails or value is invalid
            
        Returns:
            Validated timeout as float (ensures positive value)
        """
        try:
            timeout = float(self.config.llm_timeout)
            # Enforce minimum safety floor (1 second) and maximum reasonable limit (1 hour)
            if timeout < 1.0:
                return default
            if timeout > 3600.0:
                return 3600.0
            return timeout
        except (TypeError, ValueError, AttributeError):
            return default

    async def get_local_models(self) -> List[Dict[str, str]]:
        """
        Fetch available models from local providers (Ollama, LM Studio).
        
        Returns:
            List of available local models. If a provider fails, it logs a warning
            but continues to try other providers. Returns empty list if all providers fail.
        """
        local_models = []
        provider_failures = []
        
        # Centralized safe timeout conversion
        config_timeout = self._safe_timeout_conversion()
        # Use longer timeout for listing models vs inference
        # Listing can trigger model loading/swapping in some backends (e.g., Ollama)
        list_timeout = max(config_timeout, 10.0)
        
        # Try Ollama
        try:
            # Extract base_url from config to match provider constructor signature
            ollama_config = self.config.llm_providers.ollama if self.config.llm_providers else None
            ollama_base_url = ollama_config.base_url if ollama_config else "http://localhost:11434/v1"
            
            ollama = OllamaProvider(
                base_url=ollama_base_url,
                timeout=list_timeout
            )
            models = await ollama.list_models()
            local_models.extend(models)
            logger.debug(f"Successfully listed {len(models)} Ollama models")
        except Exception as e:
            provider_failures.append(("Ollama", str(e)))
            logger.warning(
                f"Failed to list Ollama models: {e}",
                exc_info=logger.isEnabledFor(logging.DEBUG)
            )

        # Try LM Studio
        try:
            # Extract base_url from config to match provider constructor signature
            lmstudio_config = self.config.llm_providers.lmstudio if self.config.llm_providers else None
            lmstudio_base_url = lmstudio_config.base_url if lmstudio_config else "http://localhost:1234/v1"
            
            lmstudio = LMStudioProvider(
                base_url=lmstudio_base_url,
                timeout=list_timeout
            )
            models = await lmstudio.list_models()
            local_models.extend(models)
            logger.debug(f"Successfully listed {len(models)} LM Studio models")
        except Exception as e:
            provider_failures.append(("LM Studio", str(e)))
            logger.warning(
                f"Failed to list LM Studio models: {e}",
                exc_info=logger.isEnabledFor(logging.DEBUG)
            )

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



