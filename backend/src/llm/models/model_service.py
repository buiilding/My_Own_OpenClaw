"""
Model Service.

Responsible for discovering and aggregating available LLM models from:
1. Static configuration (Online models)
2. Dynamic discovery via Providers (Local models)
"""

import asyncio
import logging
from collections.abc import Iterable
from typing import Any, Awaitable, Dict, List, Optional, Sequence, Tuple

from backend.src.core.config import AppConfig
from backend.src.llm.models.models_config import ONLINE_MODELS, ONLINE_THINKING_MODELS, LOCAL_VISION_MODELS

# Lazy import to avoid circular dependency
# providers imports models.models_config, so we import providers lazily
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.llm.providers.base import LLMProvider

logger = logging.getLogger(__name__)


def _build_catalog(
    source: Dict[str, List[str]],
    supports_thinking: Optional[bool] = None,
) -> Tuple[Dict[str, Any], ...]:
    """Build immutable catalog tuples from static model config."""
    models: List[Dict[str, Any]] = []
    for provider, model_ids in source.items():
        for model_id in model_ids:
            entry: Dict[str, Any] = {
                "id": model_id,
                "provider": provider,
                "display_name": f"{provider}/{model_id}",
            }
            if supports_thinking is not None:
                entry["supports_thinking"] = supports_thinking
            models.append(entry)
    return tuple(models)


def _copy_catalog(catalog: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return a defensive copy so callers cannot mutate cached catalog entries."""
    return [dict(model) for model in catalog]


def _dedupe_models(models: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate model entries by (provider, id), preserving first-seen order."""
    deduped: List[Dict[str, Any]] = []
    seen: set[tuple[Any, Any]] = set()
    for model in models:
        key = (model.get("provider"), model.get("id"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(model)
    return deduped


_ONLINE_MODELS_CATALOG = _build_catalog(ONLINE_MODELS, supports_thinking=False)
_THINKING_MODELS_CATALOG = _build_catalog(ONLINE_THINKING_MODELS, supports_thinking=True)
_VISION_MODELS_CATALOG = _build_catalog(LOCAL_VISION_MODELS)

# Thinking variants win if the same provider/model appears in both catalogs.
_THINKING_IDS = {(m["provider"], m["id"]) for m in _THINKING_MODELS_CATALOG}
_ALL_ONLINE_MODELS_CATALOG = tuple(
    sorted(
        [
            *[m for m in _ONLINE_MODELS_CATALOG if (m["provider"], m["id"]) not in _THINKING_IDS],
            *_THINKING_MODELS_CATALOG,
        ],
        key=lambda m: (m["provider"], m.get("supports_thinking", False)),
    )
)


class ModelService:
    def __init__(self, config: AppConfig):
        self.config = config

    def get_online_models(self) -> List[Dict[str, Any]]:
        """
        Return curated list of popular online models (non-thinking).
        """
        return _copy_catalog(_ONLINE_MODELS_CATALOG)

    def get_thinking_models(self) -> List[Dict[str, Any]]:
        """
        Return curated list of models that support thinking tokens.
        """
        return _copy_catalog(_THINKING_MODELS_CATALOG)

    def get_all_online_models(self) -> List[Dict[str, Any]]:
        """
        Return all online models (both thinking and non-thinking).
        
        Deduplicates models that appear in both lists, preferring the thinking version.
        """
        return _copy_catalog(_ALL_ONLINE_MODELS_CATALOG)

    def get_vision_models(self) -> List[Dict[str, Any]]:
        """
        Return curated list of local vision models.
        """
        return _copy_catalog(_VISION_MODELS_CATALOG)

    @staticmethod
    def _normalize_provider_models(raw_models: Any) -> List[Dict[str, Any]]:
        """Normalize provider model payloads to a clean list of model dicts."""
        if (
            not isinstance(raw_models, Iterable)
            or isinstance(raw_models, (str, bytes, dict))
        ):
            return []

        normalized: List[Dict[str, Any]] = []
        for item in raw_models:
            if not isinstance(item, dict):
                continue
            model_id = item.get("id")
            provider_name = item.get("provider")
            if not isinstance(model_id, str):
                continue
            if not isinstance(provider_name, str):
                continue

            normalized_id = model_id.strip()
            normalized_provider = provider_name.strip()
            if not normalized_id or not normalized_provider:
                continue
            normalized_item = dict(item)
            normalized_item["id"] = normalized_id
            normalized_item["provider"] = normalized_provider
            display_name = normalized_item.get("display_name")
            if not isinstance(display_name, str) or not display_name.strip():
                normalized_item["display_name"] = f"{normalized_provider}/{normalized_id}"
            else:
                normalized_item["display_name"] = display_name.strip()
            normalized.append(normalized_item)
        return normalized

    async def _list_models_from_provider(
        self,
        label: str,
        provider: "LLMProvider",
    ) -> tuple[str, List[Dict[str, Any]], Optional[str]]:
        """List models from one provider, returning either models or an error string."""
        try:
            raw_models = await provider.list_models()
            models = self._normalize_provider_models(raw_models)
            logger.debug(f"Successfully listed {len(models)} {label} models")
            return label, models, None
        except Exception as e:
            logger.warning(
                f"Failed to list {label} models: {e}",
                exc_info=logger.isEnabledFor(logging.DEBUG)
            )
            return label, [], str(e)

    async def get_local_models(self) -> List[Dict[str, Any]]:
        """
        Fetch available models from local providers (Ollama, LM Studio).
        
        Uses the provider factory to ensure consistent provider instantiation
        and benefit from caching. This prevents duplicate provider instances
        and ensures configuration consistency.
        
        Returns:
            List of available local models. If a provider fails, it logs a warning
            but continues to try other providers. Returns empty list if all providers fail.
        """
        # Lazy import to avoid circular dependency
        from backend.src.llm.providers import create_provider_factory
        
        local_models: List[Dict[str, Any]] = []
        provider_failures: List[tuple[str, str]] = []
        
        # Get provider factory (cached, uses same instances as rest of system)
        factory = create_provider_factory(self.config)

        jobs: List[Awaitable[tuple[str, List[Dict[str, Any]], Optional[str]]]] = []
        provider_specs = (
            ("ollama", "Ollama"),
            ("lmstudio", "LM Studio"),
        )
        for provider_key, label in provider_specs:
            provider = factory.get(provider_key)
            if provider:
                jobs.append(self._list_models_from_provider(label, provider))
            else:
                logger.debug(f"{label} provider not configured or unavailable")

        if jobs:
            provider_results = await asyncio.gather(*jobs)
            for label, models, error in provider_results:
                if error:
                    provider_failures.append((label, error))
                else:
                    local_models.extend(models)

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

        return _dedupe_models(local_models)

    async def get_all_models(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Fetch all available models.
        """
        return {
            "local": await self.get_local_models(),
            "online": self.get_all_online_models(),
            "vision": self.get_vision_models(),
        }
